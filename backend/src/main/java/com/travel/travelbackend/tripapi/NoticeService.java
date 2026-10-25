package com.travel.travelbackend.tripapi;

import com.travel.travelbackend.notifications.PushQueue;
import com.travel.travelbackend.userapi.*;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static com.travel.travelbackend.tripapi.TripStore.*;

@Service @Transactional
public class NoticeService {
    private final PlanningSupport p;
    private final TripStore s;
    private final PushQueue pushes;
    public NoticeService(PlanningSupport p,PushQueue pushes) { this.p=p;this.s=p.s;this.pushes=pushes; }
    private record Input(String title,String body,boolean pinned) {
        Object canonical() { return map("title",title,"body",body,"pinned",pinned); }
    }
    private Input input(Map<String,Object> body,boolean update) {
        if(update) Inputs.fields(body,"title","body","pinned","expectedVersion");
        else Inputs.fields(body,"title","body","pinned");
        Boolean pinned=Inputs.bool(body,"pinned");if(pinned==null)throw ApiException.invalid();
        return new Input(Inputs.string(body,"title",100,true),Inputs.string(body,"body",3000,true),pinned);
    }
    private long version(Object value) {
        if(!(value instanceof String text) || !text.matches("0|[1-9][0-9]{0,18}"))throw ApiException.invalid();
        try { return Long.parseLong(text); } catch(NumberFormatException error) { throw ApiException.invalid(); }
    }
    private Map<String,Object> access(Jwt jwt,String tripId,boolean owner) {
        var trip=p.access(jwt,tripId,false);
        if(owner)p.trips.access(trip,s.actor(jwt),true);
        return trip;
    }
    private Map<String,Object> notice(long trip,long id) {
        var row=s.one("SELECT * FROM trip_notice WHERE trip_id=? AND id=?",trip,id);
        if(row==null)throw fail(404,"NOTICE_NOT_FOUND","공지를 찾을 수 없어요.");return row;
    }
    private Object view(Map<String,Object> row) {
        Object pinned=row.get("pinned");
        return map("id",str(row,"id"),"title",str(row,"title"),"body",str(row,"body"),
            "pinned",pinned instanceof Boolean flag?flag:((Number)pinned).intValue()!=0,
            "authorId",str(row,"author_id"),"authorName",row.get("author_id")==null?"탈퇴한 사용자":s.profile(n(row,"author_id")).get("name"),
            "version",str(row,"version"),"createdAt",instant(row,"created_at"),"updatedAt",instant(row,"updated_at"));
    }
    public Object list(Jwt jwt,String tripId,String cursor,int limit) {
        var trip=access(jwt,tripId,false);long parent=n(trip,"id"),before=Long.MAX_VALUE;
        if(limit<1||limit>100)throw ApiException.invalid();
        if(cursor!=null) {
            try {
                var parts=new String(Base64.getUrlDecoder().decode(cursor),StandardCharsets.UTF_8).split("\\|",-1);
                if(parts.length!=3||!"notice".equals(parts[0])||!Long.toString(parent).equals(parts[1]))throw ApiException.invalid();
                before=Inputs.id(parts[2]);
            } catch(RuntimeException error) { throw ApiException.invalid(); }
        }
        var rows=s.db.queryForList("SELECT * FROM trip_notice WHERE trip_id=? AND id<? ORDER BY id DESC LIMIT ?",parent,before,limit+1);
        var selected=rows.subList(0,Math.min(limit,rows.size()));
        String next=rows.size()>limit?Base64.getUrlEncoder().withoutPadding().encodeToString(("notice|"+parent+"|"+n(selected.getLast(),"id")).getBytes(StandardCharsets.UTF_8)):null;
        return map("items",selected.stream().map(this::view).toList(),"nextCursor",next);
    }
    public Object get(Jwt jwt,String tripId,String noticeId) {
        return view(notice(n(access(jwt,tripId,false),"id"),Inputs.id(noticeId)));
    }
    public Object create(Jwt jwt,String tripId,String rawKey,Map<String,Object> body) {
        Input input=input(body,false);String key=PlanningSupport.key(rawKey);
        var trip=access(jwt,tripId,true);long parent=n(trip,"id"),actor=s.actor(jwt);
        String digest=p.digest(parent,input.canonical());Object replay=p.replay(actor,"notice.create",key,digest);if(replay!=null)return replay;
        p.trips.active(trip);
        long id=s.insert("INSERT INTO trip_notice(trip_id,author_id,title,body,pinned,version,created_at,updated_at) VALUES(?,?,?,?,?,0,?,?)",parent,actor,input.title(),input.body(),input.pinned(),s.now(),s.now());
        pushes.notice(parent,actor,id);
        Object response=view(notice(parent,id));p.remember(actor,"notice.create",key,digest,response);return response;
    }
    private void expected(Map<String,Object> row,long version) {
        if(n(row,"version")!=version)throw fail(409,"NOTICE_CONFLICT","공지가 변경됐어요. 최신 내용을 확인한 뒤 다시 저장해 주세요.");
    }
    public Object update(Jwt jwt,String tripId,String noticeId,String rawKey,Map<String,Object> body) {
        Input input=input(body,true);long expected=version(body.get("expectedVersion")),id=Inputs.id(noticeId);String key=PlanningSupport.key(rawKey);
        var trip=access(jwt,tripId,true);long parent=n(trip,"id"),actor=s.actor(jwt);
        String digest=p.digest(parent,map("noticeId",noticeId,"expectedVersion",Long.toString(expected),"input",input.canonical()));
        Object replay=p.replay(actor,"notice.update",key,digest);if(replay!=null)return replay;
        p.trips.active(trip);var row=notice(parent,id);expected(row,expected);
        if(expected==Long.MAX_VALUE)throw fail(409,"NOTICE_CONFLICT","공지의 수정 한도에 도달했어요.");
        s.db.update("UPDATE trip_notice SET title=?,body=?,pinned=?,version=version+1,updated_at=? WHERE id=?",input.title(),input.body(),input.pinned(),s.now(),id);
        Object response=view(notice(parent,id));p.remember(actor,"notice.update",key,digest,200,response);return response;
    }
    public Object delete(Jwt jwt,String tripId,String noticeId,String rawKey,String rawVersion) {
        long expected=version(rawVersion),id=Inputs.id(noticeId);String key=PlanningSupport.key(rawKey);
        var trip=access(jwt,tripId,true);long parent=n(trip,"id"),actor=s.actor(jwt);
        String digest=p.digest(parent,map("noticeId",noticeId,"expectedVersion",Long.toString(expected)));
        Object replay=p.replay(actor,"notice.delete",key,digest);if(replay!=null)return replay;
        p.trips.active(trip);expected(notice(parent,id),expected);s.db.update("DELETE FROM trip_notice WHERE id=?",id);
        Object response=map("deletedId",noticeId);p.remember(actor,"notice.delete",key,digest,200,response);return response;
    }
}
