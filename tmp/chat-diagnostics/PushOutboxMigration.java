import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.time.Instant;
import java.util.*;

/** Finalizes only the two approved 014 outbox tables. No push is sent by this utility. */
class PushOutboxMigration {
    static Set<String> columns(Connection c,String table) throws SQLException {
        var result=new TreeSet<String>();
        try(var q=c.prepareStatement("SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?")) {
            q.setString(1,table);try(var r=q.executeQuery()){while(r.next())result.add(r.getString(1));}
        }return result;
    }
    static long count(Connection c,String table) throws SQLException {
        try(var q=c.createStatement();var r=q.executeQuery("SELECT COUNT(*) FROM "+table)){r.next();return r.getLong(1);}
    }
    static void verify(Connection c) throws SQLException {
        if(!columns(c,"push_event").containsAll(Set.of("id","event_type","source_id","actor_id","trip_id","party_id","created_at","expires_at")))throw new IllegalStateException("Invalid push event schema");
        if(!columns(c,"push_delivery").containsAll(Set.of("id","event_id","recipient_id","device_id","token_hash","status","attempts","next_attempt_at","lease_until","lease_token","last_error_code","sent_at","created_at")))throw new IllegalStateException("Invalid push delivery schema");
        try(var q=c.createStatement();var r=q.executeQuery("SELECT COUNT(*) FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name IN ('push_event','push_delivery') AND referenced_table_name IS NOT NULL")){r.next();if(r.getInt(1)!=6)throw new IllegalStateException("Invalid push foreign key count");}
        for(var spec:Map.of("push_event:uq_push_event_source","event_type,source_id","push_delivery:uq_push_delivery_device","event_id,device_id").entrySet()) {
            String[] names=spec.getKey().split(":");
            try(var q=c.prepareStatement("SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=? AND non_unique=0")) {
                q.setString(1,names[0]);q.setString(2,names[1]);try(var r=q.executeQuery()){r.next();if(!spec.getValue().equals(r.getString(1)))throw new IllegalStateException("Invalid push deduplication index");}
            }
        }
    }
    static boolean fanoutReady(Connection c) throws SQLException {
        if(!columns(c,"push_event").containsAll(Set.of("targets_json","expanded_at")))return false;
        try(var q=c.createStatement();var r=q.executeQuery("SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='push_event' AND index_name='idx_push_event_expand'")){
            r.next();return "expanded_at,created_at,id".equals(r.getString(1));
        }
    }
    public static void main(String[] args) throws Exception {
        if(args.length!=1 || !Set.of("inspect","apply").contains(args[0]))throw new IllegalArgumentException("Use inspect or apply");
        boolean apply="apply".equals(args[0]);var config=new Properties();
        try(var r=Files.newBufferedReader(Path.of("backend/.env"),StandardCharsets.UTF_8)){config.load(r);}
        String url=config.getProperty("DB_URL");if(url==null||!url.startsWith("jdbc:mysql:"))throw new IllegalStateException("Expected configured MySQL");
        var props=new Properties();props.setProperty("user",config.getProperty("DB_USERNAME",""));props.setProperty("password",config.getProperty("DB_PASSWORD",""));props.setProperty("connectTimeout","5000");props.setProperty("socketTimeout","30000");
        try(var c=DriverManager.getConnection(url,props)) {
            c.setReadOnly(!apply);if(!"WeGoTrip".equalsIgnoreCase(c.getCatalog()))throw new IllegalStateException("Unexpected schema");
            for(String table:List.of("user","user_device","user_setting","trip","trip_party","chat_message")) if(columns(c,table).isEmpty())throw new IllegalStateException("Missing prerequisite "+table);
            boolean events=!columns(c,"push_event").isEmpty(), deliveries=!columns(c,"push_delivery").isEmpty();
            if(events!=deliveries)throw new IllegalStateException("Partial push schema requires review");
            if(events)verify(c);
            System.out.println("SCHEMA="+c.getCatalog()+" push_tables_present="+events+" existing_chat_messages="+count(c,"chat_message"));
            try(var q=c.createStatement();var r=q.executeQuery("SELECT device_type,COUNT(*) FROM user_device GROUP BY device_type")){while(r.next())System.out.println("DEVICE_COUNT "+r.getString(1)+"="+r.getLong(2));}
            try(var q=c.createStatement();var r=q.executeQuery("SELECT COUNT(*) FROM user_setting WHERE push_notification_enabled=TRUE")){r.next();System.out.println("PUSH_ENABLED_USERS="+r.getLong(1));}
            System.out.println("FANOUT_METADATA_READY="+(events&&fanoutReady(c)));
            if(!apply){System.out.println("READ_ONLY_PREFLIGHT_OK");return;}
            if(events){
                if(fanoutReady(c)){System.out.println("PUSH_SCHEMA_ALREADY_CURRENT");return;}
                if(count(c,"push_event")!=0||count(c,"push_delivery")!=0)throw new IllegalStateException("Nonempty outbox requires review before finalization");
                if(columns(c,"push_event").contains("targets_json")||columns(c,"push_event").contains("expanded_at"))throw new IllegalStateException("Partial fanout metadata requires review");
                Path snapshot=Path.of("tmp/chat-diagnostics/schema-before-014-final-"+Instant.now().toEpochMilli()+".sql");
                var text=new StringBuilder("-- Before finalizing the two user-approved outbox tables\n");
                for(String table:List.of("push_event","push_delivery")){try(var q=c.createStatement();var r=q.executeQuery("SHOW CREATE TABLE "+table)){r.next();text.append(r.getString(2)).append(";\n\n");}}
                Files.writeString(snapshot,text,StandardCharsets.UTF_8,StandardOpenOption.CREATE_NEW);
                try(var q=c.createStatement()){q.execute("ALTER TABLE push_event ADD COLUMN targets_json MEDIUMTEXT NOT NULL AFTER party_id, ADD COLUMN expanded_at TIMESTAMP(6) NULL AFTER targets_json, ADD INDEX idx_push_event_expand (expanded_at,created_at,id)");}
                verify(c);if(!fanoutReady(c))throw new IllegalStateException("Fanout metadata verification failed");
                System.out.println("PUSH_OUTBOX_FINALIZED tables_empty=true business_tables_unchanged=true schema_snapshot="+snapshot);return;
            }
            Path backup=Path.of("tmp/chat-diagnostics/schema-before-014-"+Instant.now().toEpochMilli()+".sql");
            var snapshot=new StringBuilder("-- Before user-approved push outbox creation\n");
            for(String table:List.of("chat_message","user_device","user_setting")){try(var q=c.createStatement();var r=q.executeQuery("SHOW CREATE TABLE "+table)){r.next();snapshot.append(r.getString(2)).append(";\n\n");}}
            Files.writeString(backup,snapshot,StandardCharsets.UTF_8,StandardOpenOption.CREATE_NEW);
            String sql=Files.readString(Path.of("backend/db/migrations/014-push-outbox.sql"),StandardCharsets.UTF_8).lines().filter(line->!line.stripLeading().startsWith("--")).reduce("",(a,b)->a+b+"\n");
            int steps=0;for(String statement:sql.split(";")){if(statement.isBlank())continue;try(var q=c.createStatement()){q.execute(statement);steps++;}}
            verify(c);if(!fanoutReady(c))throw new IllegalStateException("Fanout metadata verification failed");
            if(count(c,"push_event")!=0||count(c,"push_delivery")!=0)throw new IllegalStateException("Concurrent push activity detected; inspect before continuing");
            System.out.println("PUSH_OUTBOX_MIGRATION_OK statements="+steps+" queued_historical_messages=0 schema_snapshot="+backup);
        }catch(SQLException error){System.out.println("DATABASE_FAILED state="+error.getSQLState()+" code="+error.getErrorCode());System.exit(1);}
    }
}
