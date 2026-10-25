import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.*;

/** Read-only diagnostic: never prints credentials or message contents. */
class ChatDbDiagnostics {
    public static void main(String[] args) throws Exception {
        var config=new Properties();
        try(var reader=Files.newBufferedReader(Path.of("backend/.env"),StandardCharsets.UTF_8)) { config.load(reader); }
        String url=config.getProperty("DB_URL");
        if(url==null || !url.startsWith("jdbc:mysql:")) { System.out.println("DB_CONFIG_NOT_MYSQL"); return; }
        var options=new Properties();
        options.setProperty("user",config.getProperty("DB_USERNAME",""));
        options.setProperty("password",config.getProperty("DB_PASSWORD",""));
        options.setProperty("connectTimeout","5000"); options.setProperty("socketTimeout","10000");
        try(var connection=DriverManager.getConnection(url,options)) {
            connection.setReadOnly(true);
            try(var statement=connection.createStatement()) { statement.execute("SET SESSION TRANSACTION READ ONLY"); }
            System.out.println("DATABASE_CONNECTED_READ_ONLY");
            List<String> tables=List.of("chat_image_upload","chat_message","chat_poll","chat_poll_option","chat_poll_vote","trip","trip_member","trip_party","trip_party_member","api_idempotency");
            for(String table:tables) {
                var columns=new ArrayList<String>();
                try(var statement=connection.prepareStatement("SELECT column_name,column_type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? ORDER BY ordinal_position")) {
                    statement.setString(1,table);
                    try(var result=statement.executeQuery()) { while(result.next()) columns.add(result.getString(1)+":"+result.getString(2)); }
                }
                System.out.println(table+"="+(columns.isEmpty()?"MISSING":String.join(",",columns)));
            }
            for(String query:List.of(
                "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND (table_name LIKE '%chat%' OR table_name LIKE '%poll%' OR table_name LIKE '%message%') ORDER BY table_name",
                "SELECT column_name,is_nullable,column_default,extra FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='chat_message' ORDER BY ordinal_position",
                "SELECT table_name,column_name,constraint_name,referenced_table_name,referenced_column_name FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND (table_name='chat_message' OR referenced_table_name='chat_message')",
                "SELECT COUNT(*) AS message_count FROM chat_message",
                "SELECT message_type,COUNT(*) AS type_count,MAX(CHAR_LENGTH(content)) AS max_length FROM chat_message GROUP BY message_type",
                "SELECT table_name,index_name,column_name,non_unique FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='chat_message' ORDER BY index_name,seq_in_index"
            )) {
                System.out.println("DETAIL "+query);
                try(var statement=connection.createStatement(); var result=statement.executeQuery(query)) {
                    while(result.next()) { var fields=new ArrayList<String>(); for(int column=1;column<=result.getMetaData().getColumnCount();column++) fields.add(result.getMetaData().getColumnLabel(column)+"="+Objects.toString(result.getObject(column),"NULL")); System.out.println(String.join(",",fields)); }
                } catch(SQLException error) { System.out.println("DETAIL_FAILED state="+error.getSQLState()+" code="+error.getErrorCode()); }
            }
            try(var statement=connection.prepareStatement("SELECT * FROM chat_message WHERE trip_id=? AND (party_id=? OR (party_id IS NULL AND ? IS NULL)) AND id<? ORDER BY id DESC LIMIT ?")) {
                statement.setLong(1,0); statement.setNull(2,Types.BIGINT); statement.setNull(3,Types.BIGINT); statement.setLong(4,Long.MAX_VALUE); statement.setInt(5,51);
                try(var result=statement.executeQuery()) { System.out.println("CHAT_HISTORY_QUERY_OK"); }
            } catch(SQLException error) { System.out.println("CHAT_HISTORY_QUERY_FAILED state="+error.getSQLState()+" code="+error.getErrorCode()); }
        } catch(SQLException error) { System.out.println("DATABASE_FAILED state="+error.getSQLState()+" code="+error.getErrorCode()+" type="+error.getClass().getSimpleName()); }
    }
}
