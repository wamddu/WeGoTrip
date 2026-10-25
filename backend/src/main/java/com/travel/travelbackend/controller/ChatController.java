package com.travel.travelbackend.controller;

import com.travel.travelbackend.tripapi.*;
import com.travel.travelbackend.userapi.ApiResponse;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/trips/{tripId}/chat")
public class ChatController {
    private final ChatService chat;
    private final CloudinaryImages images;
    public ChatController(ChatService chat, CloudinaryImages images) { this.chat=chat; this.images=images; }
    private ResponseEntity<?> result(int status, Object data) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(ApiResponse.success(data));
    }
    @GetMapping("/messages") public Object history(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId,
        @RequestParam(required=false) String partyId, @RequestParam(required=false) String before, @RequestParam(defaultValue="50") int limit,
        @RequestParam(defaultValue="false") boolean imagesOnly) {
        return result(200,chat.history(jwt,tripId,partyId,before,limit,imagesOnly));
    }
    @GetMapping("/messages/{id}") public Object get(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId,
        @RequestParam(required=false) String partyId, @PathVariable String id) {
        return result(200,chat.get(jwt,tripId,partyId,id));
    }
    @PostMapping("/messages") public Object send(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId,
        @RequestParam(required=false) String partyId, @RequestHeader(value="Idempotency-Key",required=false) String key, @RequestBody Map<String,Object> body) {
        return result(201,chat.send(jwt,tripId,partyId,key,body));
    }
    @PostMapping("/polls") public Object poll(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId,
        @RequestParam(required=false) String partyId, @RequestHeader(value="Idempotency-Key",required=false) String key, @RequestBody Map<String,Object> body) {
        return result(201,chat.createPoll(jwt,tripId,partyId,key,body));
    }
    @PutMapping("/polls/{id}/vote") public Object vote(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId,
        @RequestParam(required=false) String partyId, @PathVariable String id, @RequestBody Map<String,Object> body) {
        return result(200,chat.changePoll(jwt,tripId,partyId,id,body,false));
    }
    @PutMapping("/polls/{id}/closure") public Object close(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId,
        @RequestParam(required=false) String partyId, @PathVariable String id, @RequestBody Map<String,Object> body) {
        return result(200,chat.changePoll(jwt,tripId,partyId,id,body,true));
    }
    @PostMapping(value="/images",consumes=MediaType.MULTIPART_FORM_DATA_VALUE) public Object upload(@AuthenticationPrincipal Jwt jwt,
        @PathVariable String tripId, @RequestParam(required=false) String partyId, @RequestPart("file") MultipartFile file) {
        chat.authorizeUpload(jwt,tripId,partyId);
        var uploaded=images.upload(file);
        return result(201,chat.recordUpload(jwt,tripId,partyId,uploaded.publicId(),uploaded.url()));
    }
}
