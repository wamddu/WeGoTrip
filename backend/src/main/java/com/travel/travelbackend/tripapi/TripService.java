package com.travel.travelbackend.tripapi;

import com.travel.travelbackend.userapi.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.oauth2.jwt.Jwt;
import tools.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.security.SecureRandom;
import java.util.*;
import static com.travel.travelbackend.tripapi.TripStore.*;

@Service @Transactional
public class TripService {
    private final TripStore s;
    private final FriendService friends;
    private final ObjectMapper json;
    private final SecureRandom random=new SecureRandom();
    public TripService(TripStore s,FriendService friends,ObjectMapper json){this.s=s;this.friends=friends;this.json=json;}
    public record Result(int status,Object data){}
    Map<String,Object> trip(long id){var t=s.one("SELECT * FROM trip WHERE id=? FOR UPDATE",id);if(t==null)throw missing();return t;}
    static ApiException missing(){return fail(404,"TRIP_NOT_FOUND","여행을 찾을 수 없어요.");}
    Map<String,Object> member(long trip,long user){return s.one("SELECT * FROM trip_member WHERE trip_id=? AND user_id=? FOR UPDATE",trip,user);}
    void access(Map<String,Object> trip,long me,boolean owner){
        if(member(n(trip,"id"),me)==null)throw missing();
        if(owner&&ownerId(trip)!=me)throw fail(403,"TRIP_OWNER_REQUIRED","여행장만 사용할 수 있어요.");
    }
    void active(Map<String,Object> trip){if(!str(trip,"status").equals("ACTIVE"))throw fail(409,"TRIP_ARCHIVED","보관된 여행입니다.");}
    long count(long id){return s.db.queryForObject("SELECT COUNT(*) FROM trip_member WHERE trip_id=?",Long.class,id);}
    long countLocked(long id){return s.db.queryForList("SELECT id FROM trip_member WHERE trip_id=? FOR UPDATE",id).size();}
    Object summary(Map<String,Object> t){return map("id",str(t,"id"),"title",str(t,"name"),"destination",str(t,"destination"),"startDate",str(t,"start_date"),"endDate",str(t,"end_date"));}
    Object detail(Map<String,Object> t,long me){return map("id",str(t,"id"),"title",str(t,"name"),"destination",str(t,"destination"),"startDate",str(t,"start_date"),"endDate",str(t,"end_date"),
        "budget",n(t,"budget"),"status",str(t,"status"),"owner",ownerId(t)==0?map("id","","name","탈퇴한 사용자"):s.profile(ownerId(t)),"memberCount",count(n(t,"id")),"maxMembers",n(t,"max_members"),
        "myRole",ownerId(t)==me?"OWNER":"MEMBER","version",n(t,"version"),"createdAt",instant(t,"created_at"),"updatedAt",instant(t,"updated_at"));}
    static long integer(Object value,long max){
        if(!(value instanceof Integer||value instanceof Long||value instanceof java.math.BigInteger))throw ApiException.invalid();
        try{long n=new java.math.BigInteger(value.toString()).longValueExact();if(n<0||n>max)throw ApiException.invalid();return n;}
        catch(ArithmeticException e){throw ApiException.invalid();}
    }
    static LocalDate date(Object value){try{if(!(value instanceof String text)||!text.matches("\\d{4}-\\d{2}-\\d{2}"))throw ApiException.invalid();return LocalDate.parse(text);}catch(RuntimeException e){throw fail(400,"INVALID_TRIP_DATES","여행 날짜를 확인해 주세요.");}}
    static void dates(LocalDate start,LocalDate end){long days=ChronoUnit.DAYS.between(start,end);if(days<0||days>=90)throw fail(400,"INVALID_TRIP_DATES","여행 기간은 1~90일이어야 합니다.");}
    public Result create(Jwt jwt,String key,Map<String,Object> body){
        Inputs.fields(body,"title","destination","startDate","endDate","budget","inviteeIds");
        if(key==null||!key.matches("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"))throw ApiException.invalid();key=key.toLowerCase(Locale.ROOT);
        String title=Inputs.string(body,"title",100,true),destination=Inputs.string(body,"destination",100,true);
        LocalDate start=date(body.get("startDate")),end=date(body.get("endDate"));dates(start,end);long budget=integer(body.get("budget"),1000000000L);
        Object raw=body.getOrDefault("inviteeIds",List.of());if(!(raw instanceof List<?> entries)||entries.size()>29)throw ApiException.invalid();
        var invitees=new TreeSet<Long>();long me=s.actor(jwt);for(Object item:entries){long id=Inputs.id(item);if(id==me||!invitees.add(id))throw ApiException.invalid();}
        s.authenticate(jwt,invitees.toArray(Long[]::new));
        String digest=hash(json.writeValueAsString(List.of(title,destination,start.toString(),end.toString(),budget,invitees)));
        var saved=s.one("SELECT * FROM api_idempotency WHERE user_id=? AND operation='trip.create' AND request_key=? FOR UPDATE",me,key);
        if(saved!=null&&instant(saved,"expires_at").isAfter(s.clock.instant())){
            if(!digest.equals(str(saved,"request_digest")))throw fail(409,"IDEMPOTENCY_KEY_REUSED","다른 입력에는 새 생성 키를 사용해 주세요.");
            return new Result((int)n(saved,"response_status"),json.readValue(str(saved,"response_body"),Object.class));
        }
        if(saved!=null)s.db.update("DELETE FROM api_idempotency WHERE id=?",n(saved,"id"));
        for(long other:invitees)if(!friends.friends(me,other))throw fail(400,"INVITEE_NOT_FRIEND","수락된 친구만 초대할 수 있어요.");
        long id=s.insert("INSERT INTO trip(name,destination,start_date,end_date,owner_id,budget,status,max_members,version,created_at,updated_at) VALUES(?,?,?,?,?,?,'ACTIVE',30,0,?,?)",title,destination,start,end,me,budget,s.now(),s.now());
        s.insert("INSERT INTO trip_member(trip_id,user_id,joined_at) VALUES(?,?,?)",id,me,s.now());
        var invitations=new ArrayList<Object>();
        for(long other:invitees){long invite=insertInvite(id,me,other);var r=s.one("SELECT * FROM trip_invitation WHERE id=?",invite);invitations.add(map("id",Long.toString(invite),"inviteeId",Long.toString(other),"status","PENDING","expiresAt",instant(r,"expires_at")));}
        Object result=map("trip",detail(trip(id),me),"invitations",invitations);
        s.insert("INSERT INTO api_idempotency(user_id,operation,request_key,request_digest,response_status,response_body,expires_at) VALUES(?,'trip.create',?,?,201,?,?)",me,key,digest,json.writeValueAsString(result),Timestamp.from(s.clock.instant().plus(Duration.ofHours(24))));
        return new Result(201,result);
    }
    public Object list(Jwt jwt,String status,String cursor,int limit){
        long me=s.authenticate(jwt);choice(status,"ACTIVE","ARCHIVED","ALL");var p=s.page(cursor,limit);
        String where="id IN (SELECT trip_id FROM trip_member WHERE user_id=?)";var args=new ArrayList<Object>(List.of(me));
        if(!status.equals("ALL")){where+=" AND status=?";args.add(status);}
        return s.pageResult(s.rows("trip",where,args,p,"created_at",false),p,"created_at",t->detail(t,me));
    }
    public Object get(Jwt jwt,String id){long me=s.authenticate(jwt);var t=trip(Inputs.id(id));access(t,me,false);return detail(t,me);}
    public Object members(Jwt jwt,String id,String cursor,int limit){long me=s.authenticate(jwt);var t=trip(Inputs.id(id));access(t,me,false);var p=s.page(cursor,limit);
        return s.pageResult(s.rows("trip_member","trip_id=?",List.of(n(t,"id")),p,"joined_at",true),p,"joined_at",r->map("user",s.profile(n(r,"user_id")),"role",n(r,"user_id")==ownerId(t)?"OWNER":"MEMBER","joinedAt",instant(r,"joined_at")));}
    public Object patch(Jwt jwt,String id,Map<String,Object> body){
        Inputs.fields(body,"title","destination","startDate","endDate","budget","status","version");if(body.size()<2)throw ApiException.invalid();
        long version=integer(body.get("version"),Long.MAX_VALUE),me=s.authenticate(jwt);var t=trip(Inputs.id(id));access(t,me,true);
        if(n(t,"version")!=version)throw fail(409,"VERSION_CONFLICT","여행 정보가 변경됐어요. 새로고침해 주세요.");
        String status=body.containsKey("status")?choice(Inputs.string(body,"status",20,false),"ACTIVE","ARCHIVED"):str(t,"status");
        if(str(t,"status").equals("ARCHIVED")&&!(body.size()==2&&status.equals("ACTIVE")))active(t);
        String title=body.containsKey("title")?Inputs.string(body,"title",100,true):str(t,"name"),destination=body.containsKey("destination")?Inputs.string(body,"destination",100,true):str(t,"destination");
        LocalDate start=date(body.getOrDefault("startDate",str(t,"start_date"))),end=date(body.getOrDefault("endDate",str(t,"end_date")));dates(start,end);
        long budget=body.containsKey("budget")?integer(body.get("budget"),1000000000L):n(t,"budget");
        s.db.update("UPDATE trip SET name=?,destination=?,start_date=?,end_date=?,budget=?,status=?,version=version+1,updated_at=? WHERE id=?",title,destination,start,end,budget,status,s.now(),n(t,"id"));
        if(status.equals("ARCHIVED"))cancelTripInvites(n(t,"id"));return detail(trip(n(t,"id")),me);
    }
    long insertInvite(long trip,long me,long other){return s.insert("INSERT INTO trip_invitation(trip_id,inviter_id,invitee_id,status,created_at,expires_at) VALUES(?,?,?,'PENDING',?,?)",trip,me,other,s.now(),s.expires());}
    void expireInvites(long trip){s.db.update("UPDATE trip_invitation SET status='EXPIRED',responded_at=? WHERE trip_id=? AND status='PENDING' AND expires_at<=?",s.now(),trip,s.now());}
    public Result invite(Jwt jwt,String id,Map<String,Object> body){
        Inputs.fields(body,"inviteeId");long other=Inputs.id(body.get("inviteeId")),me=s.authenticate(jwt,other);var t=trip(Inputs.id(id));access(t,me,true);active(t);
        if(member(n(t,"id"),other)!=null)throw fail(409,"ALREADY_TRIP_MEMBER","이미 여행에 참여하고 있어요.");
        if(!friends.friends(me,other))throw fail(400,"INVITEE_NOT_FRIEND","수락된 친구만 초대할 수 있어요.");
        expireInvites(n(t,"id"));var pending=s.one("SELECT * FROM trip_invitation WHERE trip_id=? AND invitee_id=? AND status='PENDING' FOR UPDATE",n(t,"id"),other);
        if(pending!=null)return new Result(200,inviteView(pending));
        long invite=insertInvite(n(t,"id"),me,other);return new Result(201,inviteView(s.one("SELECT * FROM trip_invitation WHERE id=?",invite)));
    }
    Object inviteView(Map<String,Object> r){String status=str(r,"status");if(status.equals("PENDING")&&!instant(r,"expires_at").isAfter(s.clock.instant()))status="EXPIRED";
        return map("id",str(r,"id"),"trip",summary(s.one("SELECT * FROM trip WHERE id=?",n(r,"trip_id"))),"inviter",s.profile(n(r,"inviter_id")),"invitee",s.profile(n(r,"invitee_id")),"status",status,"createdAt",instant(r,"created_at"),"expiresAt",instant(r,"expires_at"),"respondedAt",instant(r,"responded_at"));}
    public Object invitations(Jwt jwt,String tripId,String status,String cursor,int limit){
        long me=s.authenticate(jwt);choice(status,"PENDING","ACCEPTED","DECLINED","CANCELLED","EXPIRED");var p=s.page(cursor,limit);
        String where;var args=new ArrayList<Object>();
        if(tripId!=null){var t=trip(Inputs.id(tripId));access(t,me,true);where="trip_id=?";args.add(n(t,"id"));}else{where="invitee_id=?";args.add(me);}
        if(status.equals("PENDING")){where+=" AND status='PENDING' AND expires_at>?";args.add(s.now());}
        else if(status.equals("EXPIRED")){where+=" AND (status='EXPIRED' OR (status='PENDING' AND expires_at<=?))";args.add(s.now());}
        else{where+=" AND status=?";args.add(status);}
        return s.pageResult(s.rows("trip_invitation",where,args,p,"created_at",false),p,"created_at",this::inviteView);
    }
    Object membership(Map<String,Object> t,Map<String,Object> m){return map("userId",str(m,"user_id"),"role",ownerId(t)==n(m,"user_id")?"OWNER":"MEMBER","joinedAt",instant(m,"joined_at"));}
    Map<String,Object> joinMember(Map<String,Object> t,long me){
        active(t);var m=member(n(t,"id"),me);if(m!=null)return m;
        if(countLocked(n(t,"id"))>=n(t,"max_members"))throw fail(409,"TRIP_FULL","여행 정원이 가득 찼어요.");
        s.insert("INSERT INTO trip_member(trip_id,user_id,joined_at) VALUES(?,?,?)",n(t,"id"),me,s.now());return member(n(t,"id"),me);
    }
    public Object decide(Jwt jwt,String rawId,String action){
        choice(action,"accept","decline","cancel");long id=Inputs.id(rawId),me=s.actor(jwt);var hint=s.one("SELECT * FROM trip_invitation WHERE id=?",id);
        if(hint==null||n(hint,action.equals("cancel")?"inviter_id":"invitee_id")!=me)throw fail(404,"INVITATION_NOT_FOUND","초대를 찾을 수 없어요.");
        // Only the actor is needed: owner withdrawal and joins serialize on trip.
        s.authenticate(jwt);var t=trip(n(hint,"trip_id"));if(action.equals("cancel"))access(t,me,true);
        var r=s.one("SELECT * FROM trip_invitation WHERE id=? FOR UPDATE",id);String status=str(r,"status");
        String next=switch(action){case "accept"->"ACCEPTED";case "decline"->"DECLINED";default->"CANCELLED";};
        if(status.equals(next)){
            if(next.equals("ACCEPTED")){var m=member(n(t,"id"),me);if(m==null)throw fail(409,"INVITATION_NOT_PENDING","멤버십이 더 이상 유효하지 않아요.");return map("tripId",str(t,"id"),"status",next,"membership",membership(t,m));}
            return map("id",rawId,"status",next);
        }
        if(status.equals("EXPIRED")||(status.equals("PENDING")&&!instant(r,"expires_at").isAfter(s.clock.instant())))throw fail(410,"INVITATION_EXPIRED","초대가 만료됐어요.");
        if(!status.equals("PENDING"))throw fail(409,"INVITATION_NOT_PENDING","이미 처리된 초대입니다.");active(t);
        Map<String,Object> m=null;if(next.equals("ACCEPTED"))m=joinMember(t,me);
        s.db.update("UPDATE trip_invitation SET status=?,responded_at=? WHERE id=?",next,s.now(),id);
        return m==null?map("id",rawId,"status",next):map("tripId",str(t,"id"),"status",next,"membership",membership(t,m));
    }
    public Object issueCode(Jwt jwt,String id){long me=s.authenticate(jwt);var t=trip(Inputs.id(id));access(t,me,true);active(t);
        revoke(n(t,"id"));String alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";var code=new StringBuilder();
        // 26 independent uniform Base32 symbols = 130 random bits.
        for(int i=0;i<26;i++)code.append(alphabet.charAt(random.nextInt(32)));
        var expires=s.expires();s.insert("INSERT INTO trip_invite_code(trip_id,digest,expires_at,created_at) VALUES(?,?,?,?)",n(t,"id"),hash(code.toString()),expires,s.now());
        return map("code",code.toString(),"expiresAt",expires.toInstant());
    }
    void revoke(long id){s.db.update("UPDATE trip_invite_code SET revoked_at=? WHERE trip_id=? AND revoked_at IS NULL",s.now(),id);}
    public void revokeCode(Jwt jwt,String id){long me=s.authenticate(jwt);var t=trip(Inputs.id(id));access(t,me,true);active(t);revoke(n(t,"id"));}
    public Result join(Jwt jwt,Map<String,Object> body,boolean preview){
        Inputs.fields(body,"code");String code=Inputs.string(body,"code",100,true).toUpperCase(Locale.ROOT);long me=s.authenticate(jwt);
        if(!code.matches("[A-Z2-7]{26}"))throw badCode();var hint=s.one("SELECT trip_id FROM trip_invite_code WHERE digest=?",hash(code));if(hint==null)throw badCode();
        var t=trip(n(hint,"trip_id"));var c=s.one("SELECT * FROM trip_invite_code WHERE digest=? FOR UPDATE",hash(code));
        if(c==null||c.get("revoked_at")!=null||!instant(c,"expires_at").isAfter(s.clock.instant())||!str(t,"status").equals("ACTIVE"))throw badCode();
        var existing=member(n(t,"id"),me);
        if(preview)return new Result(200,map("trip",summary(t),"memberCount",count(n(t,"id")),"maxMembers",n(t,"max_members"),"alreadyMember",existing!=null));
        var m=joinMember(t,me);expireInvites(n(t,"id"));
        s.db.update("UPDATE trip_invitation SET status='ACCEPTED',responded_at=? WHERE trip_id=? AND invitee_id=? AND status='PENDING'",s.now(),n(t,"id"),me);
        return new Result(existing==null?201:200,map("tripId",str(t,"id"),"membership",membership(t,m)));
    }
    static ApiException badCode(){return fail(404,"INVALID_INVITE_CODE","사용할 수 없는 초대 코드입니다.");}
    void cancelTripInvites(long id){s.db.update("UPDATE trip_invitation SET status='CANCELLED',responded_at=? WHERE trip_id=? AND status='PENDING'",s.now(),id);revoke(id);}
    private static long ownerId(Map<String,Object> trip) { return trip.get("owner_id")==null?0:n(trip,"owner_id"); }
    /** Called inside the existing withdrawal transaction, after locking the user. */
    public void withdraw(long user){
        var locked=s.db.queryForList("SELECT * FROM trip WHERE owner_id=? OR id IN (SELECT trip_id FROM trip_member WHERE user_id=?) ORDER BY id FOR UPDATE",user,user);
        var owned=locked.stream().filter(t->ownerId(t)==user).toList();
        for(var t:owned){if(str(t,"status").equals("ACTIVE")&&countLocked(n(t,"id"))>1)throw fail(409,"ACTIVE_TRIP_OWNER","다른 멤버가 있는 여행을 먼저 보관해 주세요.");}
        for(var t:owned){s.db.update("UPDATE trip SET owner_id=NULL,status='ARCHIVED',version=version+1,updated_at=? WHERE id=?",s.now(),n(t,"id"));cancelTripInvites(n(t,"id"));}
        s.db.update("DELETE FROM trip_member WHERE user_id=?",user);
        s.db.update("DELETE FROM friendship WHERE user1_id=? OR user2_id=?",user,user);
        s.db.update("DELETE FROM friend_request WHERE requester_id=? OR receiver_id=?",user,user);
        s.db.update("DELETE FROM trip_invitation WHERE inviter_id=? OR invitee_id=?",user,user);
        s.db.update("DELETE FROM api_idempotency WHERE user_id=?",user);
    }
}
