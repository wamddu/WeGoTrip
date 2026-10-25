import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.time.Instant;
import java.util.*;

/** Approved 012 only. No credentials, URLs or chat contents are printed. */
class PollDeadlineMigration {
    static Set<String> columns(Connection c) throws SQLException {
        var columns=new TreeSet<String>();
        try(var q=c.createStatement(); var rows=q.executeQuery("SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='chat_poll'")) {
            while(rows.next()) columns.add(rows.getString(1));
        }
        return columns;
    }
    static List<String> index(Connection c) throws SQLException {
        var columns=new ArrayList<String>();
        try(var q=c.createStatement(); var rows=q.executeQuery("SELECT column_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='chat_poll' AND index_name='idx_chat_poll_deadline' ORDER BY seq_in_index")) {
            while(rows.next()) columns.add(rows.getString(1));
        }
        return columns;
    }
    static void checkColumn(Connection c) throws SQLException {
        try(var q=c.createStatement(); var r=q.executeQuery("SELECT data_type,datetime_precision,is_nullable,column_default,extra FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='chat_poll' AND column_name='closes_at'")) {
            if(!r.next() || !"timestamp".equalsIgnoreCase(r.getString(1)) || r.getInt(2)!=6 || !"YES".equals(r.getString(3)) || r.getObject(4)!=null || r.getString(5).toLowerCase(Locale.ROOT).contains("on update"))
                throw new IllegalStateException("Unexpected deadline column definition; stopped");
        }
    }
    static long count(Connection c,String table) throws SQLException {
        try(var q=c.createStatement(); var r=q.executeQuery("SELECT COUNT(*) FROM "+table)) { r.next();return r.getLong(1); }
    }
    public static void main(String[] args) throws Exception {
        if(args.length!=1 || !Set.of("inspect","apply").contains(args[0])) throw new IllegalArgumentException("Use inspect or apply");
        boolean apply="apply".equals(args[0]);
        var config=new Properties();
        try(var reader=Files.newBufferedReader(Path.of("backend/.env"),StandardCharsets.UTF_8)) { config.load(reader); }
        String url=config.getProperty("DB_URL");
        if(url==null || !url.startsWith("jdbc:mysql:")) throw new IllegalStateException("Expected configured MySQL database");
        var props=new Properties();
        props.setProperty("user",config.getProperty("DB_USERNAME","")); props.setProperty("password",config.getProperty("DB_PASSWORD",""));
        props.setProperty("connectTimeout","5000"); props.setProperty("socketTimeout","30000");
        try(var c=DriverManager.getConnection(url,props)) {
            c.setReadOnly(!apply);
            if(!"WeGoTrip".equalsIgnoreCase(c.getCatalog())) throw new IllegalStateException("Unexpected database; stopped");
            var existing=columns(c);
            if(!existing.containsAll(Set.of("id","message_id","question","closed"))) throw new IllegalStateException("Chat poll baseline is missing; stopped");
            if(existing.contains("closes_at")) checkColumn(c);
            var currentIndex=index(c);
            if(!currentIndex.isEmpty() && !currentIndex.equals(List.of("closed","closes_at"))) throw new IllegalStateException("Deadline index name already has a different definition; stopped");
            System.out.println("SCHEMA="+c.getCatalog()+" COLUMNS="+String.join(",",existing));
            System.out.println("COUNTS polls="+count(c,"chat_poll")+" options="+count(c,"chat_poll_option")+" votes="+count(c,"chat_poll_vote"));
            if(!apply) { System.out.println("READ_ONLY_PREFLIGHT_OK deadline_index="+currentIndex); return; }
            Path backup=Path.of("tmp/chat-diagnostics/schema-before-012-"+Instant.now().toEpochMilli()+".sql");
            try(var q=c.createStatement(); var r=q.executeQuery("SHOW CREATE TABLE chat_poll")) {
                r.next();Files.writeString(backup,"-- Before approved additive poll deadline migration\n"+r.getString(2)+";\n",StandardCharsets.UTF_8,StandardOpenOption.CREATE_NEW);
            }
            String source=Files.readString(Path.of("backend/db/migrations/012-chat-poll-deadline.sql"),StandardCharsets.UTF_8);
            String sql=source.lines().filter(line->!line.stripLeading().startsWith("--")).reduce("",(a,b)->a+b+"\n");
            int steps=0;
            for(String command:sql.split(";")) {
                if(command.isBlank()) continue;
                try(var q=c.createStatement()) { q.execute(command); steps++; }
            }
            checkColumn(c);
            if(!index(c).equals(List.of("closed","closes_at"))) throw new IllegalStateException("Deadline index verification failed");
            try(var q=c.createStatement(); var r=q.executeQuery("SELECT COUNT(*) FROM chat_poll WHERE closes_at IS NOT NULL")) {
                r.next(); System.out.println("DEADLINE_ROWS="+r.getLong(1));
            }
            System.out.println("POLL_DEADLINE_MIGRATION_OK statements="+steps+" schema_snapshot="+backup);
        } catch(SQLException error) {
            System.out.println("DATABASE_FAILED state="+error.getSQLState()+" code="+error.getErrorCode());System.exit(1);
        }
    }
}
