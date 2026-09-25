package com.travel.travelbackend.controller;

import com.travel.travelbackend.tripapi.*;
import com.travel.travelbackend.userapi.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController @RequestMapping("/api/v1")
public class TripController {
    private final TripService trips;
    private final FriendService friends;
    private final TripRateLimit limits;
    public TripController(TripService trips,FriendService friends,TripRateLimit limits){this.trips=trips;this.friends=friends;this.limits=limits;}
    private ResponseEntity<?> result(int status,Object data){return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(ApiResponse.success(data));}
    private ResponseEntity<?> ok(Object data){return result(200,data);}
    private void limit(Jwt jwt,HttpServletRequest request,boolean send){
        boolean user=limits.allow((send?"send:":"lookup:")+jwt.getSubject(),send?3600:60,send?30:10);
        boolean ip=send||limits.allow("lookup-ip:"+request.getRemoteAddr(),60,10);
        if(!user||!ip)throw new ApiException(429,"TOO_MANY_REQUESTS","잠시 후 다시 시도해 주세요.");
    }
    @PostMapping("/users/lookup") public Object lookup(@AuthenticationPrincipal Jwt jwt,@RequestBody Map<String,Object> body,HttpServletRequest request){limit(jwt,request,false);return ok(friends.lookup(jwt,body));}
    @GetMapping("/friends") public Object friends(@AuthenticationPrincipal Jwt jwt,@RequestParam(required=false) String cursor,@RequestParam(defaultValue="20") int limit){return ok(friends.list(jwt,cursor,limit));}
    @PostMapping("/friend-requests") public Object request(@AuthenticationPrincipal Jwt jwt,@RequestBody Map<String,Object> body,HttpServletRequest request){limit(jwt,request,true);var r=friends.request(jwt,body);return result(r.status(),r.data());}
    @GetMapping("/friend-requests") public Object requests(@AuthenticationPrincipal Jwt jwt,@RequestParam(defaultValue="received") String direction,@RequestParam(defaultValue="PENDING") String status,@RequestParam(required=false) String cursor,@RequestParam(defaultValue="20") int limit){return ok(friends.requests(jwt,direction,status,cursor,limit));}
    @PostMapping("/friend-requests/{id}/{action}") public Object friendDecision(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@PathVariable String action){return ok(friends.decide(jwt,id,action));}
    @DeleteMapping("/friends/{id}") public Object removeFriend(@AuthenticationPrincipal Jwt jwt,@PathVariable String id){friends.remove(jwt,id);return ok(null);}
    @PostMapping("/trips") public Object create(@AuthenticationPrincipal Jwt jwt,@RequestHeader(value="Idempotency-Key",required=false) String key,@RequestBody Map<String,Object> body,HttpServletRequest request){limit(jwt,request,true);var r=trips.create(jwt,key,body);return result(r.status(),r.data());}
    @GetMapping("/trips") public Object list(@AuthenticationPrincipal Jwt jwt,@RequestParam(defaultValue="ACTIVE") String status,@RequestParam(required=false) String cursor,@RequestParam(defaultValue="20") int limit){return ok(trips.list(jwt,status,cursor,limit));}
    @GetMapping("/trips/{id}") public Object get(@AuthenticationPrincipal Jwt jwt,@PathVariable String id){return ok(trips.get(jwt,id));}
    @PatchMapping("/trips/{id}") public Object patch(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestBody Map<String,Object> body){return ok(trips.patch(jwt,id,body));}
    @GetMapping("/trips/{id}/members") public Object members(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestParam(required=false) String cursor,@RequestParam(defaultValue="20") int limit){return ok(trips.members(jwt,id,cursor,limit));}
    @PostMapping("/trips/{id}/invitations") public Object invite(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestBody Map<String,Object> body,HttpServletRequest request){limit(jwt,request,true);var r=trips.invite(jwt,id,body);return result(r.status(),r.data());}
    @GetMapping("/trips/{id}/invitations") public Object sentInvites(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestParam(defaultValue="PENDING") String status,@RequestParam(required=false) String cursor,@RequestParam(defaultValue="20") int limit){return ok(trips.invitations(jwt,id,status,cursor,limit));}
    @GetMapping("/users/me/trip-invitations") public Object receivedInvites(@AuthenticationPrincipal Jwt jwt,@RequestParam(defaultValue="PENDING") String status,@RequestParam(required=false) String cursor,@RequestParam(defaultValue="20") int limit){return ok(trips.invitations(jwt,null,status,cursor,limit));}
    @PostMapping("/trip-invitations/{id}/{action}") public Object invitationDecision(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@PathVariable String action){return ok(trips.decide(jwt,id,action));}
    @PostMapping("/trips/{id}/invite-code") public Object code(@AuthenticationPrincipal Jwt jwt,@PathVariable String id){return result(201,trips.issueCode(jwt,id));}
    @DeleteMapping("/trips/{id}/invite-code") public Object revoke(@AuthenticationPrincipal Jwt jwt,@PathVariable String id){trips.revokeCode(jwt,id);return ok(null);}
    @PostMapping("/trip-join/preview") public Object preview(@AuthenticationPrincipal Jwt jwt,@RequestBody Map<String,Object> body,HttpServletRequest request){limit(jwt,request,false);var r=trips.join(jwt,body,true);return result(r.status(),r.data());}
    @PostMapping("/trip-join") public Object join(@AuthenticationPrincipal Jwt jwt,@RequestBody Map<String,Object> body,HttpServletRequest request){limit(jwt,request,false);var r=trips.join(jwt,body,false);return result(r.status(),r.data());}
}
