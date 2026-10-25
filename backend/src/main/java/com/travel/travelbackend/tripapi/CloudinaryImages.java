package com.travel.travelbackend.tripapi;

import com.travel.travelbackend.userapi.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.ObjectMapper;
import java.io.*;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;

@Component
public class CloudinaryImages {
    private final String cloud, key, secret;
    private final ObjectMapper json;
    private final Clock clock;
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    public record Uploaded(String publicId, String url) {}
    public CloudinaryImages(@Value("${CLOUDINARY_CLOUD_NAME:}") String cloud,
        @Value("${CLOUDINARY_API_KEY:}") String key, @Value("${CLOUDINARY_API_SECRET:}") String secret,
        ObjectMapper json, Clock clock) {
        this.cloud=cloud; this.key=key; this.secret=secret; this.json=json; this.clock=clock;
    }
    public Uploaded upload(MultipartFile file) {
        if(cloud.isBlank() || key.isBlank() || secret.isBlank())
            throw new ApiException(503,"IMAGE_UPLOAD_NOT_CONFIGURED","이미지 업로드 설정이 필요해요.");
        if(!cloud.matches("[A-Za-z0-9_-]+")) throw new IllegalStateException("Invalid Cloudinary cloud name");
        if(file.isEmpty() || file.getSize()>8*1024*1024) throw new ApiException(413,"IMAGE_TOO_LARGE","이미지는 8MB 이하로 선택해 주세요.");
        try {
            byte[] bytes=file.getBytes();
            String mime=imageType(bytes);
            String publicId="wegotrip/chat/"+UUID.randomUUID();
            String timestamp=Long.toString(clock.instant().getEpochSecond());
            String signed="allowed_formats=jpg,png,webp,gif&public_id="+publicId+"&timestamp="+timestamp;
            String signature=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1").digest((signed+secret).getBytes(StandardCharsets.UTF_8)));
            String boundary="ChatUpload"+UUID.randomUUID().toString().replace("-","");
            var out=new ByteArrayOutputStream();
            var fields=new LinkedHashMap<String,String>();
            fields.put("allowed_formats","jpg,png,webp,gif"); fields.put("public_id",publicId);
            fields.put("timestamp",timestamp); fields.put("api_key",key); fields.put("signature",signature);
            for(var field:fields.entrySet()) out.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\""+field.getKey()+"\"\r\n\r\n"+field.getValue()+"\r\n").getBytes(StandardCharsets.UTF_8));
            out.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"file\"; filename=\"image\"\r\nContent-Type: "+mime+"\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            out.write(bytes); out.write(("\r\n--"+boundary+"--\r\n").getBytes(StandardCharsets.UTF_8));
            var request=HttpRequest.newBuilder(URI.create("https://api.cloudinary.com/v1_1/"+cloud+"/image/upload"))
                .timeout(Duration.ofSeconds(30)).header("Content-Type","multipart/form-data; boundary="+boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(out.toByteArray())).build();
            var response=client.send(request,HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()<200 || response.statusCode()>=300) throw new IOException("Upload rejected");
            var result=json.readValue(response.body(),Map.class);
            String url=Objects.toString(result.get("secure_url"),"");
            var uri=URI.create(url);
            if(!publicId.equals(result.get("public_id")) || !"image".equals(result.get("resource_type")) ||
                !"https".equals(uri.getScheme()) || !"res.cloudinary.com".equals(uri.getHost()) ||
                !uri.getPath().startsWith("/"+cloud+"/image/upload/")) throw new IOException("Invalid upload response");
            return new Uploaded(publicId,url);
        } catch(ApiException e) { throw e; }
        catch(InterruptedException e) { Thread.currentThread().interrupt(); throw unavailable(); }
        catch(Exception e) { throw unavailable(); }
    }
    private static ApiException unavailable() { return new ApiException(502,"IMAGE_UPLOAD_FAILED","이미지를 업로드하지 못했어요. 다시 시도해 주세요."); }
    private static String imageType(byte[] b) {
        if(b.length>=12) {
            if((b[0]&255)==255 && (b[1]&255)==216 && (b[2]&255)==255) return "image/jpeg";
            if(Arrays.equals(Arrays.copyOf(b,8),new byte[]{(byte)137,80,78,71,13,10,26,10})) return "image/png";
            String head=new String(b,0,12,StandardCharsets.US_ASCII);
            if(head.startsWith("GIF87a") || head.startsWith("GIF89a")) return "image/gif";
            if(head.startsWith("RIFF") && head.endsWith("WEBP")) return "image/webp";
        }
        throw new ApiException(400,"INVALID_IMAGE","JPG, PNG, WebP, GIF 이미지만 올릴 수 있어요.");
    }
}
