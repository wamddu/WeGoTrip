package com.travel.travelbackend.tripapi;

import com.travel.travelbackend.userapi.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/** Only fixed-size, single-pin maps are signed. The signing secret never leaves the server. */
@Component
public class StaticMapSigner {
    private final String key;
    private final byte[] secret;
    public StaticMapSigner(@Value("${GOOGLE_MAPS_STATIC_API_KEY:}") String key,
                           @Value("${GOOGLE_MAPS_URL_SIGNING_SECRET:}") String secret) {
        this.key=key.trim();
        byte[] decoded=null;
        try { if(!secret.isBlank()) decoded=Base64.getUrlDecoder().decode(secret.trim()); }
        catch(IllegalArgumentException ignored) { /* A bad optional configuration must not stop unrelated chat. */ }
        this.secret=decoded;
    }
    public void requireConfigured() {
        if(key.isBlank() || secret==null || secret.length==0)
            throw new ApiException(503,"LOCATION_MAP_UNAVAILABLE","위치 지도 설정이 준비되지 않았어요. 관리자에게 문의해 주세요.");
    }
    public String sign(BigDecimal latitude, BigDecimal longitude) {
        requireConfigured();
        if(latitude==null || longitude==null || latitude.abs().compareTo(BigDecimal.valueOf(90))>0
            || longitude.abs().compareTo(BigDecimal.valueOf(180))>0) throw ApiException.invalid();
        String point=latitude.toPlainString()+","+longitude.toPlainString();
        String resource="/maps/api/staticmap?center="+encode(point)+"&zoom=16&size=320x200&scale=2&format=png&maptype=roadmap&language=ko&markers="
            +encode("color:0x208AEF|"+point)+"&key="+encode(key);
        try {
            var mac=Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(secret,"HmacSHA1"));
            String signature=Base64.getUrlEncoder().encodeToString(mac.doFinal(resource.getBytes(StandardCharsets.UTF_8)));
            return "https://maps.googleapis.com"+resource+"&signature="+signature;
        } catch(java.security.GeneralSecurityException error) {
            throw new ApiException(503,"LOCATION_MAP_UNAVAILABLE","위치 지도를 준비하지 못했어요.");
        }
    }
    private static String encode(String value) { return URLEncoder.encode(value,StandardCharsets.UTF_8).replace("+","%20"); }
}
