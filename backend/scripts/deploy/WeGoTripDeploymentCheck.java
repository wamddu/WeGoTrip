import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.Base64;
import java.util.Properties;

/** Read-only preflight for the location-enabled backend. Never prints credentials. */
public final class WeGoTripDeploymentCheck {
    public static void main(String[] args) {
        try {
            Properties settings = new Properties();
            try (Reader reader = Files.newBufferedReader(Path.of("/home/ec2-user/.env"), StandardCharsets.UTF_8)) {
                settings.load(reader);
            }
            String url = setting(settings, "DB_URL");
            String username = setting(settings, "DB_USERNAME");
            if (url.isBlank() || username.isBlank()) {
                throw new IllegalStateException("Database configuration is missing");
            }
            Properties connectionSettings = new Properties();
            connectionSettings.setProperty("user", username);
            connectionSettings.setProperty("password", setting(settings, "DB_PASSWORD"));
            connectionSettings.setProperty("connectTimeout", "5000");
            connectionSettings.setProperty("socketTimeout", "5000");
            Class.forName("com.mysql.cj.jdbc.Driver");
            try (var connection = DriverManager.getConnection(url, connectionSettings);
                 var query = connection.createStatement()) {
                connection.setReadOnly(true);
                query.setQueryTimeout(5);
                try (var columns = query.executeQuery("SELECT message_id,latitude,longitude,accuracy_m,captured_at,revoked_at FROM chat_location LIMIT 0")) {
                    if (columns.getMetaData().getColumnCount() != 6) throw new IllegalStateException("Unexpected location schema");
                }
                try (var column = query.executeQuery("SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='chat_message' AND COLUMN_NAME='kind'")) {
                    if (!column.next()) throw new IllegalStateException("Chat kind column is missing");
                    String type = column.getString(1);
                    if (type.startsWith("enum(") && !type.contains("'LOCATION'")) {
                        throw new IllegalStateException("Chat kind does not accept locations");
                    }
                }
            }
            System.out.println("DATABASE_LOCATION_SCHEMA_READY=true");
            String key = setting(settings, "GOOGLE_MAPS_STATIC_API_KEY");
            String signingSecret = setting(settings, "GOOGLE_MAPS_URL_SIGNING_SECRET");
            boolean mapsReady = false;
            try {
                mapsReady = !key.isBlank() && !signingSecret.isBlank()
                        && Base64.getUrlDecoder().decode(signingSecret).length > 0;
            } catch (IllegalArgumentException ignored) {
                // Report configuration state without disclosing the setting.
            }
            System.out.println("LOCATION_MAP_CONFIGURED=" + mapsReady);
            if (!mapsReady) {
                System.out.println("Location maps need GOOGLE_MAPS_STATIC_API_KEY and GOOGLE_MAPS_URL_SIGNING_SECRET in the server environment.");
            }
        } catch (Exception error) {
            System.err.println("DEPLOY_PREFLIGHT_FAILED=" + error.getClass().getSimpleName());
            System.err.println("Check the server .env and migration 016-chat-location.sql before replacing app.jar.");
            System.exit(1);
        }
    }

    private static String setting(Properties settings, String key) {
        String environment = System.getenv(key);
        return environment != null ? environment.strip() : settings.getProperty(key, "").strip();
    }
}
