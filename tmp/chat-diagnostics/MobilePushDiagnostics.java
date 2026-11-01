import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.sql.*;
import java.util.*;

/** Targeted SELECT-only diagnosis. Never outputs passwords, FCM tokens, or chat contents. */
class MobilePushDiagnostics {
    static final String RECEIVER = "wjdgma1111@gmail.com";
    static final String SENDER = "wjdgma3333@gmail.com";
    static final String TRIP = "테스트 여행";

    static void query(Connection c, String label, String sql, Object... parameters) {
        System.out.println("CHECK " + label);
        try (var s = c.prepareStatement(sql)) {
            s.setQueryTimeout(15);
            for (int i = 0; i < parameters.length; i++) s.setObject(i + 1, parameters[i]);
            try (var rows = s.executeQuery()) {
                int count = 0;
                while (rows.next()) {
                    var fields = new ArrayList<String>();
                    for (int i = 1; i <= rows.getMetaData().getColumnCount(); i++)
                        fields.add(rows.getMetaData().getColumnLabel(i) + "=" + Objects.toString(rows.getObject(i), "NULL"));
                    System.out.println(String.join(" | ", fields));
                    count++;
                }
                System.out.println("ROWS=" + count);
            }
        } catch (SQLException e) {
            System.out.println("QUERY_FAILED state=" + e.getSQLState() + " code=" + e.getErrorCode());
        }
    }

    public static void main(String[] args) throws Exception {
        var env = new Properties();
        try (var r = Files.newBufferedReader(Path.of("backend/.env"), StandardCharsets.UTF_8)) { env.load(r); }
        var properties = new Properties();
        properties.setProperty("user", env.getProperty("DB_USERNAME", ""));
        properties.setProperty("password", env.getProperty("DB_PASSWORD", ""));
        properties.setProperty("connectTimeout", "5000");
        properties.setProperty("socketTimeout", "20000");
        try (var c = DriverManager.getConnection(env.getProperty("DB_URL"), properties)) {
            c.setReadOnly(true);
            c.setAutoCommit(false);
            try (var s = c.createStatement()) { s.execute("START TRANSACTION READ ONLY"); }
            System.out.println("DATABASE_CONNECTED_READ_ONLY");
            query(c, "DATABASE_TIME", "SELECT CURRENT_TIMESTAMP AS db_now,UTC_TIMESTAMP AS db_utc,@@session.time_zone AS session_time_zone");
            query(c, "USERS", "SELECT u.id,u.email,u.status,us.push_notification_enabled FROM `user` u LEFT JOIN user_setting us ON us.user_id=u.id WHERE u.email IN (?,?) ORDER BY u.id", RECEIVER, SENDER);
            query(c, "TRIPS_AND_MEMBERSHIP", "SELECT t.id AS trip_id,t.name,t.status AS trip_status,u.email,tm.id AS member_id,tm.notification_enabled,tm.joined_at FROM trip t JOIN trip_member tm ON tm.trip_id=t.id JOIN `user` u ON u.id=tm.user_id WHERE t.name=? AND u.email IN (?,?) ORDER BY t.id,u.id", TRIP, RECEIVER, SENDER);
            query(c, "REGISTERED_DEVICES", "SELECT u.email,d.id AS device_id,d.device_type,(CHAR_LENGTH(d.fcm_token)>0) AS token_present,d.created_at,d.last_active_at FROM `user` u JOIN user_device d ON d.user_id=u.id WHERE u.email IN (?,?) ORDER BY u.id,d.id", RECEIVER, SENDER);
            query(c, "LATEST_WEB_MESSAGES", "SELECT m.id AS message_id,m.trip_id,m.party_id,m.kind,m.created_at,e.id AS push_event_id,e.expanded_at,JSON_LENGTH(e.targets_json) AS unexpanded_target_count,CASE WHEN m.party_id IS NULL THEN TRUE ELSE EXISTS(SELECT 1 FROM trip_party_member pm JOIN trip_member tm ON tm.id=pm.trip_member_id JOIN `user` receiver ON receiver.id=tm.user_id WHERE pm.party_id=m.party_id AND tm.trip_id=m.trip_id AND receiver.email=?) END AS receiver_in_room FROM chat_message m JOIN trip t ON t.id=m.trip_id JOIN `user` sender ON sender.id=m.author_id LEFT JOIN push_event e ON e.event_type='CHAT_MESSAGE' AND e.source_id=m.id WHERE t.name=? AND sender.email=? ORDER BY m.id DESC LIMIT 15", RECEIVER, TRIP, SENDER);
            query(c, "RECEIVER_PUSH_DELIVERIES", "SELECT d.id AS delivery_id,e.id AS event_id,e.source_id AS message_id,e.event_type,e.trip_id,e.party_id,d.device_id,ud.device_type,d.status,d.attempts,d.last_error_code,d.created_at,d.next_attempt_at,d.sent_at,e.expires_at FROM push_delivery d JOIN push_event e ON e.id=d.event_id JOIN trip t ON t.id=e.trip_id JOIN `user` receiver ON receiver.id=d.recipient_id LEFT JOIN user_device ud ON ud.id=d.device_id WHERE t.name=? AND receiver.email=? ORDER BY d.id DESC LIMIT 25", TRIP, RECEIVER);
            query(c, "RECENT_PUSH_EVENTS", "SELECT e.id,e.event_type,e.source_id,e.trip_id,e.actor_id,e.party_id,e.created_at,e.expanded_at,JSON_LENGTH(e.targets_json) AS unexpanded_target_count,e.expires_at FROM push_event e JOIN trip t ON t.id=e.trip_id JOIN `user` sender ON sender.id=e.actor_id WHERE t.name=? AND sender.email=? ORDER BY e.id DESC LIMIT 15", TRIP, SENDER);
            c.rollback();
        } catch (SQLException e) {
            System.out.println("DATABASE_FAILED state=" + e.getSQLState() + " code=" + e.getErrorCode() + " type=" + e.getClass().getSimpleName());
            System.exit(1);
        }
    }
}
