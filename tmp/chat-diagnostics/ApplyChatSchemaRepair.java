import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.*;

/** Apply only the reviewed additive 011 repair, preserving all existing tables. */
class ApplyChatSchemaRepair {
    static Set<String> columns(Connection c, String table) throws SQLException {
        var result=new HashSet<String>();
        try(var query=c.prepareStatement("SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?")) {
            query.setString(1,table);
            try(var rows=query.executeQuery()) { while(rows.next()) result.add(rows.getString(1)); }
        }
        return result;
    }
    static long count(Connection c) throws SQLException {
        try(var query=c.createStatement(); var rows=query.executeQuery("SELECT COUNT(*) FROM chat_message")) { rows.next(); return rows.getLong(1); }
    }
    public static void main(String[] args) throws Exception {
        var config=new Properties();
        try(var reader=Files.newBufferedReader(Path.of("backend/.env"),StandardCharsets.UTF_8)) { config.load(reader); }
        String url=config.getProperty("DB_URL");
        if(url==null || !url.startsWith("jdbc:mysql:")) throw new IllegalStateException("Expected the inspected MySQL configuration");
        var options=new Properties();
        options.setProperty("user",config.getProperty("DB_USERNAME",""));
        options.setProperty("password",config.getProperty("DB_PASSWORD",""));
        options.setProperty("connectTimeout","5000"); options.setProperty("socketTimeout","15000");
        try(var c=DriverManager.getConnection(url,options)) {
            var existing=columns(c,"chat_message");
            var required=Set.of("party_id","author_id","kind","text","image_upload_id","revision");
            boolean legacy=existing.containsAll(Set.of("sender_id","content","message_type")) && !existing.containsAll(required);
            if(!legacy) throw new IllegalStateException("Schema differs from the inspected legacy baseline; stop for review");
            long before=count(c);
            if(before!=0) throw new IllegalStateException("Legacy messages exist; a separate backfill must be reviewed first");
            for(String table:List.of("trip","trip_party","user","saved_place")) if(columns(c,table).isEmpty()) throw new IllegalStateException("Missing prerequisite table: "+table);
            StringBuilder backup=new StringBuilder("-- Schema before additive chat repair. chat_message count: "+before+"\n");
            for(String table:List.of("chat_message","chat_attachment","chat_image_upload")) {
                if(columns(c,table).isEmpty()) continue;
                try(var query=c.createStatement();var rows=query.executeQuery("SHOW CREATE TABLE `"+table+"`")) { rows.next(); backup.append(rows.getString(2)).append(";\n\n"); }
            }
            Path backupPath=Path.of("tmp/chat-diagnostics/schema-before-011.sql");
            if(Files.exists(backupPath)) throw new IllegalStateException("A previous schema snapshot exists; inspect before retrying");
            Files.writeString(backupPath,backup,StandardCharsets.UTF_8,StandardOpenOption.CREATE_NEW);
            String migration=Files.readString(Path.of("backend/db/migrations/011-existing-chat-schema.sql"),StandardCharsets.UTF_8);
            String sql=migration.lines().filter(line->!line.stripLeading().startsWith("--")).reduce("",(a,b)->a+b+"\n");
            int step=0;
            for(String command:sql.split(";")) {
                if(command.isBlank()) continue;
                step++;
                try(var statement=c.createStatement()) { statement.execute(command); }
                catch(SQLException error) { System.out.println("REPAIR_FAILED step="+step+" state="+error.getSQLState()+" code="+error.getErrorCode()); return; }
            }
            if(!columns(c,"chat_message").containsAll(required)) throw new IllegalStateException("Required chat columns are still missing");
            for(String table:List.of("chat_image_upload","chat_poll","chat_poll_option","chat_poll_vote")) if(columns(c,table).isEmpty()) throw new IllegalStateException("Missing chat table: "+table);
            if(count(c)!=before) throw new IllegalStateException("Message count changed during repair; inspect concurrent activity");
            System.out.println("CHAT_SCHEMA_REPAIR_OK statements="+step+" original_message_count="+before);
            System.out.println("SCHEMA_SNAPSHOT=tmp/chat-diagnostics/schema-before-011.sql");
        } catch(SQLException error) { System.out.println("DATABASE_FAILED state="+error.getSQLState()+" code="+error.getErrorCode()); }
    }
}
