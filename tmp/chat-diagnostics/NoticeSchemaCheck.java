import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.*;

class NoticeSchemaCheck {
    public static void main(String[] args) throws Exception {
        var config=new Properties();
        try(var reader=Files.newBufferedReader(Path.of("backend/.env"),StandardCharsets.UTF_8)){config.load(reader);}
        var properties=new Properties();properties.setProperty("user",config.getProperty("DB_USERNAME"));properties.setProperty("password",config.getProperty("DB_PASSWORD"));properties.setProperty("connectTimeout","5000");properties.setProperty("socketTimeout","15000");
        try(var connection=DriverManager.getConnection(config.getProperty("DB_URL"),properties)) {
            connection.setReadOnly(true);
            if(!"WeGoTrip".equalsIgnoreCase(connection.getCatalog()))throw new IllegalStateException("Unexpected schema");
            try(var query=connection.createStatement();var rows=query.executeQuery("SELECT table_name,column_name,column_type,is_nullable,column_comment FROM information_schema.columns WHERE table_schema=DATABASE() ORDER BY table_name,ordinal_position")) {
                String table="";int count=0;while(rows.next()){
                    if(!table.equals(rows.getString(1))){table=rows.getString(1);System.out.println("TABLE "+table);}
                    System.out.printf("  %s %s nullable=%s %s%n",rows.getString(2),rows.getString(3),rows.getString(4),rows.getString(5));count++;
                }System.out.println("SCHEMA_COLUMNS="+count);
            }
            try(var query=connection.createStatement();var rows=query.executeQuery("SELECT table_name,column_name,referenced_table_name,referenced_column_name FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND referenced_table_name IS NOT NULL ORDER BY table_name,column_name")) {
                while(rows.next())System.out.printf("FK %s.%s -> %s.%s%n",rows.getString(1),rows.getString(2),rows.getString(3),rows.getString(4));
            }
        } catch(SQLException error){System.out.println("SCHEMA_CHECK_FAILED state="+error.getSQLState()+" code="+error.getErrorCode());System.exit(1);}
    }
}
