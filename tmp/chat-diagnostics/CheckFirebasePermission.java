import com.google.auth.oauth2.GoogleCredentials;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.List;

/** Read-only IAM check; never prints authentication material. */
class CheckFirebasePermission {
    public static void main(String[] args) throws Exception {
        String project="wegotrip-65c44";
        try {
            var credentials=GoogleCredentials.getApplicationDefault().createScoped(List.of("https://www.googleapis.com/auth/cloud-platform"));
            credentials.refreshIfExpired();
            var request=HttpRequest.newBuilder(URI.create("https://cloudresourcemanager.googleapis.com/v1/projects/"+project+":testIamPermissions"))
                .timeout(Duration.ofSeconds(20)).header("Authorization","Bearer "+credentials.getAccessToken().getTokenValue())
                .header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString("{\"permissions\":[\"cloudmessaging.messages.create\"]}")).build();
            var response=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build().send(request,HttpResponse.BodyHandlers.ofString());
            System.out.println("FCM_IAM_CHECK status="+response.statusCode()+" can_send="+(response.statusCode()==200 && response.body().contains("\"cloudmessaging.messages.create\"")));
        } catch(Exception error) { System.out.println("FCM_IAM_CHECK_FAILED type="+error.getClass().getSimpleName()); }
    }
}
