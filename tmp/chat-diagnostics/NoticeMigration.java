import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.time.Instant;
import java.util.*;

/** Creates only the user-approved trip_notice table. Never creates notices or sends push. */
class NoticeMigration {
    private static final List<String> PRESERVED=List.of("user","trip","chat_message","notification","push_event","push_delivery");
    static Map<String,String> columns(Connection connection,String table) throws SQLException {
        var columns=new LinkedHashMap<String,String>();
        try(var query=connection.prepareStatement("SELECT column_name,column_type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? ORDER BY ordinal_position")) {
            query.setString(1,table);try(var rows=query.executeQuery()){while(rows.next())columns.put(rows.getString(1),rows.getString(2));}
        }return columns;
    }
    static String ddl(Connection connection,String table) throws SQLException {
        try(var query=connection.createStatement();var rows=query.executeQuery("SHOW CREATE TABLE `"+table+"`")){rows.next();return rows.getString(2);}
    }
    static long count(Connection connection,String table) throws SQLException {
        try(var query=connection.createStatement();var rows=query.executeQuery("SELECT COUNT(*) FROM `"+table+"`")){rows.next();return rows.getLong(1);}
    }
    static Map<String,Long> counts(Connection connection) throws SQLException {
        var counts=new LinkedHashMap<String,Long>();for(String table:PRESERVED)counts.put(table,count(connection,table));return counts;
    }
    static void verify(Connection connection) throws SQLException {
        var columns=columns(connection,"trip_notice");
        if(!columns.keySet().equals(new LinkedHashSet<>(List.of("id","trip_id","author_id","title","body","pinned","version","created_at","updated_at"))))throw new IllegalStateException("Unexpected notice columns");
        if(!"varchar(100)".equals(columns.get("title"))||!"text".equals(columns.get("body"))||!"bigint".equals(columns.get("version")))throw new IllegalStateException("Unexpected notice types");
        for(String column:List.of("created_at","updated_at"))if(!"timestamp(6)".equals(columns.get(column)))throw new IllegalStateException("Invalid notice timestamp");
        try(var query=connection.createStatement();var rows=query.executeQuery("SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='trip_notice' AND index_name='idx_trip_notice_list'")){rows.next();if(!"trip_id,id".equals(rows.getString(1)))throw new IllegalStateException("Invalid notice list index");}
        var expected=Map.of("trip_id","trip:id:CASCADE","author_id","user:id:SET NULL");var foreignKeys=new HashMap<String,String>();
        try(var query=connection.createStatement();var rows=query.executeQuery("SELECT k.column_name,k.referenced_table_name,k.referenced_column_name,r.delete_rule FROM information_schema.key_column_usage k JOIN information_schema.referential_constraints r ON r.constraint_schema=k.constraint_schema AND r.constraint_name=k.constraint_name AND r.table_name=k.table_name WHERE k.table_schema=DATABASE() AND k.table_name='trip_notice' AND k.referenced_table_name IS NOT NULL")) {
            while(rows.next())foreignKeys.put(rows.getString(1),rows.getString(2)+":"+rows.getString(3)+":"+rows.getString(4));
        }
        if(!expected.equals(foreignKeys))throw new IllegalStateException("Invalid notice foreign keys");
        try(var query=connection.createStatement();var rows=query.executeQuery("SELECT column_name,is_nullable,column_default,extra FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='trip_notice'")) {
            while(rows.next()) {
                String column=rows.getString(1);if(!("author_id".equals(column)?"YES":"NO").equals(rows.getString(2)))throw new IllegalStateException("Unexpected notice nullability");
                if(Set.of("pinned","version").contains(column)&&!"0".equals(rows.getString(3)))throw new IllegalStateException("Invalid notice default");
                if("id".equals(column)&&!rows.getString(4).contains("auto_increment"))throw new IllegalStateException("Invalid notice ID generation");
            }
        }
    }
    public static void main(String[] args) throws Exception {
        if(args.length!=1||!Set.of("inspect","apply").contains(args[0]))throw new IllegalArgumentException("Use inspect or apply");
        boolean apply="apply".equals(args[0]);var config=new Properties();
        try(var reader=Files.newBufferedReader(Path.of("backend/.env"),StandardCharsets.UTF_8)){config.load(reader);}
        String url=config.getProperty("DB_URL");if(url==null||!url.startsWith("jdbc:mysql:"))throw new IllegalStateException("Expected configured MySQL");
        var properties=new Properties();properties.setProperty("user",config.getProperty("DB_USERNAME"));properties.setProperty("password",config.getProperty("DB_PASSWORD"));properties.setProperty("connectTimeout","5000");properties.setProperty("socketTimeout","30000");
        try(var connection=DriverManager.getConnection(url,properties)) {
            connection.setReadOnly(!apply);if(!"WeGoTrip".equalsIgnoreCase(connection.getCatalog()))throw new IllegalStateException("Unexpected schema");
            for(String table:PRESERVED)if(columns(connection,table).isEmpty())throw new IllegalStateException("Missing prerequisite table "+table);
            if(!columns(connection,"trip_member").containsKey("notification_enabled"))throw new IllegalStateException("Missing trip notification preference");
            var before=counts(connection);boolean exists=!columns(connection,"trip_notice").isEmpty();
            System.out.println("SCHEMA=WeGoTrip trip_notice_present="+exists+" existing_counts="+before);
            if(exists){verify(connection);System.out.println("NOTICE_SCHEMA_ALREADY_CURRENT notice_count="+count(connection,"trip_notice"));return;}
            if(!apply){System.out.println("READ_ONLY_PREFLIGHT_OK");return;}
            Path backup=Path.of("tmp/chat-diagnostics/schema-before-015-"+Instant.now().toEpochMilli()+".sql");
            var schema=new LinkedHashMap<String,String>();var snapshot=new StringBuilder("-- Before user-approved trip_notice creation\n");
            for(String table:PRESERVED){String definition=ddl(connection,table);schema.put(table,definition);snapshot.append(definition).append(";\n\n");}
            snapshot.append("-- Counts before: ").append(before).append('\n');Files.writeString(backup,snapshot,StandardCharsets.UTF_8,StandardOpenOption.CREATE_NEW);
            String sql=Files.readString(Path.of("backend/db/migrations/015-trip-notices.sql"),StandardCharsets.UTF_8).lines().filter(line->!line.stripLeading().startsWith("--")).reduce("",(a,b)->a+b+"\n").strip();
            if(!sql.startsWith("CREATE TABLE IF NOT EXISTS trip_notice (")||sql.chars().filter(value->value==';').count()!=1||!sql.endsWith(";"))throw new IllegalStateException("Only approved notice creation is allowed");
            try(var query=connection.createStatement()){query.execute(sql);}
            verify(connection);for(String table:PRESERVED)if(!schema.get(table).equals(ddl(connection,table)))throw new IllegalStateException("Existing schema changed during migration");
            var after=counts(connection);
            if(count(connection,"trip_notice")!=0)throw new IllegalStateException("Concurrent notice creation detected; inspect migration state");
            System.out.println("NOTICE_MIGRATION_OK existing_schema_unchanged=true counts_unchanged="+before.equals(after)+" notice_count=0");
            System.out.println("SCHEMA_SNAPSHOT="+backup+" counts_after="+after);
        }catch(SQLException error){System.out.println("DATABASE_FAILED state="+error.getSQLState()+" code="+error.getErrorCode());System.exit(1);}
    }
}
