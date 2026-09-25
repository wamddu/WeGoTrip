package com.travel.travelbackend.tripapi;

import com.travel.travelbackend.userapi.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.oauth2.jwt.Jwt;
import java.util.*;
import static com.travel.travelbackend.tripapi.TripStore.*;

@Service @Transactional
public class FriendService {
    private final TripStore s;
    public FriendService(TripStore s){this.s=s;}
    public record Result(int status,Object data){}
    public Object lookup(Jwt jwt,Map<String,Object> body){
        long me=s.authenticate(jwt);Inputs.fields(body,"email");String email=Inputs.string(body,"email",255,true).toLowerCase(Locale.ROOT);
        if(!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))throw ApiException.invalid();
        var row=s.one("SELECT id FROM `user` WHERE email=? AND status='ACTIVE' AND id<>?",email,me);
        return map("user",row==null?null:s.profile(n(row,"id")));
    }
    boolean friends(long a,long b){return s.one("SELECT id FROM friendship WHERE user1_id=? AND user2_id=?",Math.min(a,b),Math.max(a,b))!=null;}
    public Object list(Jwt jwt,String cursor,int limit){
        long me=s.authenticate(jwt);var p=s.page(cursor,limit);
        var rows=s.rows("friendship","(user1_id=? OR user2_id=?)",List.of(me,me),p,"created_at",false);
        return s.pageResult(rows,p,"created_at",r->map("user",s.profile(n(r,"user1_id")==me?n(r,"user2_id"):n(r,"user1_id")),"friendsSince",instant(r,"created_at")));
    }
    public Result request(Jwt jwt,Map<String,Object> body){
        Inputs.fields(body,"recipientId");long other=Inputs.id(body.get("recipientId")), me=s.actor(jwt);
        if(me==other)throw ApiException.invalid();s.authenticate(jwt,other);
        if(friends(me,other))throw fail(409,"ALREADY_FRIENDS","이미 친구입니다.");
        var row=s.one("SELECT * FROM friend_request WHERE status='PENDING' AND ((requester_id=? AND receiver_id=?) OR (requester_id=? AND receiver_id=?)) FOR UPDATE",me,other,other,me);
        if(row!=null)return new Result(200,view(row));
        long id=s.insert("INSERT INTO friend_request(requester_id,receiver_id,user_low_id,user_high_id,status,created_at) VALUES(?,?,?,?,'PENDING',?)",me,other,Math.min(me,other),Math.max(me,other),s.now());
        return new Result(201,view(s.one("SELECT * FROM friend_request WHERE id=?",id)));
    }
    Object view(Map<String,Object> row){return map("id",str(row,"id"),"requester",s.profile(n(row,"requester_id")),"recipient",s.profile(n(row,"receiver_id")),"status",str(row,"status"),"createdAt",instant(row,"created_at"));}
    public Object requests(Jwt jwt,String direction,String status,String cursor,int limit){
        long me=s.authenticate(jwt);choice(direction,"received","sent");choice(status,"PENDING","ACCEPTED","DECLINED","CANCELLED");var p=s.page(cursor,limit);
        return s.pageResult(s.rows("friend_request",(direction.equals("received")?"receiver_id":"requester_id")+"=? AND status=?",List.of(me,status),p,"created_at",false),p,"created_at",this::view);
    }
    public Object decide(Jwt jwt,String rawId,String action){
        long id=Inputs.id(rawId),me=s.actor(jwt);choice(action,"accept","decline","cancel");
        var hint=s.one("SELECT * FROM friend_request WHERE id=?",id);
        if(hint==null||n(hint,action.equals("cancel")?"requester_id":"receiver_id")!=me)throw fail(404,"REQUEST_NOT_FOUND","친구 요청을 찾을 수 없어요.");
        s.authenticate(jwt,n(hint,"requester_id"),n(hint,"receiver_id"));
        var row=s.one("SELECT * FROM friend_request WHERE id=? FOR UPDATE",id);
        String next=switch(action){case "accept"->"ACCEPTED";case "decline"->"DECLINED";default->"CANCELLED";};
        String current=str(row,"status");if(!current.equals(next)&&!current.equals("PENDING"))throw fail(409,"REQUEST_NOT_PENDING","이미 처리된 요청입니다.");
        long other=n(row,"requester_id");
        if(current.equals("PENDING")){
            if(next.equals("ACCEPTED")&&!friends(me,other))s.insert("INSERT INTO friendship(user1_id,user2_id,created_at) VALUES(?,?,?)",Math.min(me,other),Math.max(me,other),s.now());
            s.db.update("UPDATE friend_request SET status=?,responded_at=? WHERE id=?",next,s.now(),id);
        }
        var result=map("requestId",rawId,"status",next);if(next.equals("ACCEPTED"))result.put("friend",s.profile(other));return result;
    }
    public void remove(Jwt jwt,String target){long other=Inputs.id(target),me=s.actor(jwt);s.authenticate(jwt);
        // The actor lock serializes deletion against requests/acceptance involving this user.
        s.db.update("DELETE FROM friendship WHERE user1_id=? AND user2_id=?",Math.min(me,other),Math.max(me,other));}
}
