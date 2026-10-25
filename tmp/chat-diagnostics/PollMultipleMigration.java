import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.time.Instant;
import java.util.*;

/** User-approved 013 only. Inspect is read-only; output never includes credentials or vote contents. */
class PollMultipleMigration {
    static Set<String> columns(Connection c) throws SQLException {
        var result=new TreeSet<String>();
        try(var q=c.createStatement();var r=q.executeQuery("SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='chat_poll'")) {
            while(r.next()) result.add(r.getString(1));
        }
        return result;
    }
    static Map<String,List<String>> uniqueIndexes(Connection c) throws SQLException {
        var result=new TreeMap<String,List<String>>();
        try(var q=c.createStatement();var r=q.executeQuery("SELECT index_name,column_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='chat_poll_vote' AND non_unique=0 ORDER BY index_name,seq_in_index")) {
            while(r.next()) result.computeIfAbsent(r.getString(1),key->new ArrayList<>()).add(r.getString(2));
        }
        return result;
    }
    static void checkColumn(Connection c) throws SQLException {
        try(var q=c.createStatement();var r=q.executeQuery("SELECT data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='chat_poll' AND column_name='allow_multiple'")) {
            if(!r.next() || !"tinyint".equals(r.getString(1)) || !"NO".equals(r.getString(2)) || !"0".equals(r.getString(3)))
                throw new IllegalStateException("Unexpected multiple-choice column definition");
        }
    }
    static Set<String> foreignKeys(Connection c) throws SQLException {
        var result=new TreeSet<String>();
        try(var q=c.createStatement();var r=q.executeQuery("SELECT table_name,constraint_name,column_name,referenced_table_name,referenced_column_name FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name IN ('chat_poll','chat_poll_vote') AND referenced_table_name IS NOT NULL ORDER BY table_name,constraint_name,ordinal_position")) {
            while(r.next()) result.add(r.getString(1)+":"+r.getString(2)+":"+r.getString(3)+":"+r.getString(4)+":"+r.getString(5));
        }
        return result;
    }
    static Set<String> votes(Connection c) throws SQLException {
        var result=new HashSet<String>();
        try(var q=c.createStatement();var r=q.executeQuery("SELECT id,poll_id,option_id,user_id FROM chat_poll_vote")) {
            while(r.next()) result.add(r.getLong(1)+":"+r.getLong(2)+":"+r.getLong(3)+":"+r.getLong(4));
        }
        return result;
    }
    static long count(Connection c,String table) throws SQLException {
        try(var q=c.createStatement();var r=q.executeQuery("SELECT COUNT(*) FROM "+table)) { r.next();return r.getLong(1); }
    }
    public static void main(String[] args) throws Exception {
        if(args.length!=1 || !Set.of("inspect","apply").contains(args[0])) throw new IllegalArgumentException("Use inspect or apply");
        boolean apply="apply".equals(args[0]);
        var config=new Properties();
        try(var reader=Files.newBufferedReader(Path.of("backend/.env"),StandardCharsets.UTF_8)) { config.load(reader); }
        String url=config.getProperty("DB_URL");
        if(url==null || !url.startsWith("jdbc:mysql:")) throw new IllegalStateException("Expected configured MySQL database");
        var props=new Properties(); props.setProperty("user",config.getProperty("DB_USERNAME","")); props.setProperty("password",config.getProperty("DB_PASSWORD",""));
        props.setProperty("connectTimeout","5000"); props.setProperty("socketTimeout","30000");
        try(var c=DriverManager.getConnection(url,props)) {
            c.setReadOnly(!apply);
            if(!"WeGoTrip".equalsIgnoreCase(c.getCatalog())) throw new IllegalStateException("Unexpected database");
            var existing=columns(c);
            if(!existing.containsAll(Set.of("id","message_id","question","closed","closes_at"))) throw new IllegalStateException("Expected chat schema through 012");
            if(existing.contains("allow_multiple")) checkColumn(c);
            var indexes=uniqueIndexes(c); var target=List.of("poll_id","user_id","option_id");
            if(indexes.containsKey("uq_chat_poll_vote_option") && !indexes.get("uq_chat_poll_vote_option").equals(target)) throw new IllegalStateException("Target index name has an unexpected definition");
            long oldCount=indexes.values().stream().filter(value->value.equals(List.of("poll_id","user_id"))).count();
            if(oldCount>1 || indexes.values().stream().anyMatch(value->value.equals(List.of("user_id","poll_id")))) throw new IllegalStateException("Unexpected duplicate or reversed legacy unique index; stopped");
            System.out.println("SCHEMA="+c.getCatalog()+" multiple_column="+existing.contains("allow_multiple")+" vote_unique_indexes="+indexes);
            System.out.println("COUNTS polls="+count(c,"chat_poll")+" options="+count(c,"chat_poll_option")+" votes="+count(c,"chat_poll_vote"));
            if(!apply) { System.out.println("READ_ONLY_PREFLIGHT_OK");return; }
            var originalVotes=votes(c); var originalForeignKeys=foreignKeys(c);
            if(originalForeignKeys.size()!=4) throw new IllegalStateException("Unexpected foreign key baseline");
            Path backup=Path.of("tmp/chat-diagnostics/schema-before-013-"+Instant.now().toEpochMilli()+".sql");
            var snapshot=new StringBuilder("-- Before approved multiple-choice poll migration\n");
            for(String table:List.of("chat_poll","chat_poll_vote")) {
                try(var q=c.createStatement();var r=q.executeQuery("SHOW CREATE TABLE "+table)) { r.next();snapshot.append(r.getString(2)).append(";\n\n"); }
            }
            Files.writeString(backup,snapshot,StandardCharsets.UTF_8,StandardOpenOption.CREATE_NEW);
            String source=Files.readString(Path.of("backend/db/migrations/013-chat-poll-multiple.sql"),StandardCharsets.UTF_8);
            String sql=source.lines().filter(line->!line.stripLeading().startsWith("--")).reduce("",(a,b)->a+b+"\n");
            int steps=0;
            for(String command:sql.split(";")) {
                if(command.isBlank()) continue;
                try(var q=c.createStatement()) { q.execute(command);steps++; }
            }
            checkColumn(c); indexes=uniqueIndexes(c);
            if(!target.equals(indexes.get("uq_chat_poll_vote_option")) || indexes.values().stream().anyMatch(value->value.equals(List.of("poll_id","user_id")))) throw new IllegalStateException("Unique index verification failed");
            if(!votes(c).containsAll(originalVotes)) throw new IllegalStateException("Original votes changed during application; inspect concurrent activity");
            if(!foreignKeys(c).equals(originalForeignKeys)) throw new IllegalStateException("Foreign keys changed unexpectedly");
            System.out.println("POLL_MULTIPLE_MIGRATION_OK statements="+steps+" preserved_votes="+originalVotes.size()+" preserved_foreign_keys="+originalForeignKeys.size());
            System.out.println("SCHEMA_SNAPSHOT="+backup);
        } catch(SQLException error) { System.out.println("DATABASE_FAILED state="+error.getSQLState()+" code="+error.getErrorCode());System.exit(1); }
    }
}
