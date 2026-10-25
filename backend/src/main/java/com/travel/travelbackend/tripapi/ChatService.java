package com.travel.travelbackend.tripapi;

import com.travel.travelbackend.userapi.*;
import com.travel.travelbackend.notifications.PushQueue;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import static com.travel.travelbackend.tripapi.TripStore.*;

@Service
@Transactional
public class ChatService {
    private final PlanningSupport p;
    private final TripStore s;
    private final ApplicationEventPublisher events;
    private final PushQueue pushes;
    public record Changed(long tripId, Long partyId, long messageId) {}
    public ChatService(PlanningSupport p, ApplicationEventPublisher events, PushQueue pushes) {
        this.p=p; this.s=p.s; this.events=events;this.pushes=pushes;
    }

    // The trip lock also serializes votes, party membership edits and archival.
    @Transactional(propagation=org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    public void authorize(Jwt jwt, String tripId, String partyId) { access(jwt,tripId,partyId,false); }
    public void authorizeUpload(Jwt jwt, String tripId, String partyId) { access(jwt,tripId,partyId,true); }
    private Map<String,Object> access(Jwt jwt, String tripId, String partyId, boolean write) {
        var trip=p.access(jwt,tripId,write);
        if(partyId!=null) {
            long party=Inputs.id(partyId);
            var member=s.one("SELECT pm.id FROM trip_party_member pm JOIN trip_party tp ON tp.id=pm.party_id JOIN trip_member tm ON tm.id=pm.trip_member_id WHERE tp.trip_id=? AND tp.id=? AND tm.trip_id=? AND tm.user_id=?",
                n(trip,"id"),party,n(trip,"id"),s.actor(jwt));
            if(member==null) throw fail(404,"CHAT_NOT_FOUND","참여 중인 채팅방을 찾을 수 없어요.");
        }
        return trip;
    }
    private Map<String,Object> message(long trip, String party, long id) {
        var row=s.one("SELECT * FROM chat_message WHERE id=? AND trip_id=? AND (party_id=? OR (party_id IS NULL AND ? IS NULL))",id,trip,party,party);
        if(row==null) throw fail(404,"MESSAGE_NOT_FOUND","메시지를 찾을 수 없어요.");
        return row;
    }
    private Object view(Map<String,Object> row, long actor) {
        Object image=null, poll=null;
        if(row.get("image_upload_id")!=null) {
            var upload=s.one("SELECT image_url FROM chat_image_upload WHERE id=?",row.get("image_upload_id"));
            if(upload!=null) image=str(upload,"image_url");
        }
        if("POLL".equals(str(row,"kind"))) {
            var r=s.one("SELECT * FROM chat_poll WHERE message_id=?",n(row,"id"));
            var options=s.db.queryForList("SELECT o.*, (SELECT COUNT(*) FROM chat_poll_vote v WHERE v.option_id=o.id) AS votes FROM chat_poll_option o WHERE o.poll_id=? ORDER BY o.id",n(r,"id"));
            var own=s.db.queryForList("SELECT option_id FROM chat_poll_vote WHERE poll_id=? AND user_id=? ORDER BY option_id",n(r,"id"),actor);
            boolean multiple=Boolean.TRUE.equals(r.get("allow_multiple")) || "1".equals(str(r,"allow_multiple"));
            long participants=s.db.queryForObject("SELECT COUNT(DISTINCT user_id) FROM chat_poll_vote WHERE poll_id=?",Long.class,n(r,"id"));
            Instant now=s.clock.instant();
            poll=map("id",str(r,"id"),"question",str(r,"question"),"closed",pollClosed(r,now),"closesAt",instant(r,"closes_at"),"serverNow",now,
                "allowMultiple",multiple,"participantCount",participants,"myOptionIds",own.stream().map(o->str(o,"option_id")).toList(),
                "myOptionId",multiple || own.isEmpty()?null:str(own.getFirst(),"option_id"),"options",options.stream().map(o->map("id",str(o,"id"),"label",str(o,"label"),
                    "placeId",o.get("saved_place_id")==null?null:str(o,"saved_place_id"),"placeName",str(o,"place_name"),"placeAddress",str(o,"place_address"),"votes",n(o,"votes"))).toList());
        }
        return map("id",str(row,"id"),"kind",str(row,"kind"),"text",str(row,"text"),"authorId",row.get("author_id")==null?null:str(row,"author_id"),
            "authorName",row.get("author_id")==null?"탈퇴한 사용자":s.profile(n(row,"author_id")).get("name"),"createdAt",instant(row,"created_at"),
            "revision",str(row,"revision"),"imageUrl",image,"poll",poll);
    }
    public Object history(Jwt jwt, String tripId, String partyId, String before, int limit, boolean imagesOnly) {
        var trip=access(jwt,tripId,partyId,false);
        if(limit<1 || limit>100) throw ApiException.invalid();
        long boundary=before==null?Long.MAX_VALUE:Inputs.id(before);
        String filter=imagesOnly?" AND kind='IMAGE' AND image_upload_id IS NOT NULL":"";
        var rows=s.db.queryForList("SELECT * FROM chat_message WHERE trip_id=? AND (party_id=? OR (party_id IS NULL AND ? IS NULL)) AND id<?"+filter+" ORDER BY id DESC LIMIT ?",n(trip,"id"),partyId,partyId,boundary,limit+1);
        boolean more=rows.size()>limit;
        var selected=new ArrayList<>(rows.subList(0,Math.min(limit,rows.size())));
        String cursor=more?str(selected.getLast(),"id"):null;
        Collections.reverse(selected);
        return map("items",selected.stream().map(r->view(r,s.actor(jwt))).toList(),"nextCursor",cursor);
    }
    public Object get(Jwt jwt, String tripId, String partyId, String id) {
        var trip=access(jwt,tripId,partyId,false);
        return view(message(n(trip,"id"),partyId,Inputs.id(id)),s.actor(jwt));
    }
    public Object send(Jwt jwt, String tripId, String partyId, String key, Map<String,Object> body) {
        Inputs.fields(body,"text","uploadId");
        var trip=access(jwt,tripId,partyId,true);
        long actor=s.actor(jwt), tid=n(trip,"id");
        key=PlanningSupport.key(key);
        String text=PlanningSupport.optionalText(body,"text",2000);
        Long uploadId=PlanningSupport.optionalId(body,"uploadId");
        if(text.isEmpty() && uploadId==null) throw ApiException.invalid();
        String digest=p.digest(tid,map("partyId",partyId,"text",text,"uploadId",uploadId));
        Object replay=p.replay(actor,"chat.send",key,digest);
        if(replay!=null) return replay;
        if(uploadId!=null) {
            var upload=s.one("SELECT * FROM chat_image_upload WHERE id=? AND trip_id=? AND author_id=? AND (party_id=? OR (party_id IS NULL AND ? IS NULL)) AND claimed=FALSE",uploadId,tid,actor,partyId,partyId);
            if(upload==null) throw fail(400,"INVALID_CHAT_IMAGE","이 채팅방에 업로드한 이미지를 선택해 주세요.");
            s.db.update("UPDATE chat_image_upload SET claimed=TRUE WHERE id=?",uploadId);
        }
        long id=s.insert("INSERT INTO chat_message(trip_id,party_id,author_id,kind,text,image_upload_id,created_at) VALUES(?,?,?,?,?,?,?)",tid,partyId,actor,uploadId==null?"TEXT":"IMAGE",text,uploadId,s.now());
        pushes.chat(tid,partyId==null?null:Inputs.id(partyId),actor,id);
        Object result=view(message(tid,partyId,id),actor);
        p.remember(actor,"chat.send",key,digest,result);
        events.publishEvent(new Changed(tid,partyId==null?null:Inputs.id(partyId),id));
        return result;
    }
    private List<Map<String,Object>> options(Object raw, long tripId) {
        if(!(raw instanceof List<?> list) || list.isEmpty() || list.size()>10) throw ApiException.invalid();
        var result=new ArrayList<Map<String,Object>>();
        var seen=new HashSet<String>();
        for(Object item:list) {
            if(!(item instanceof Map<?,?> values)) throw ApiException.invalid();
            var input=new LinkedHashMap<String,Object>();
            values.forEach((k,v)-> { if(!(k instanceof String)) throw ApiException.invalid(); input.put((String)k,v); });
            Inputs.fields(input,"label","placeId");
            Long place=PlanningSupport.optionalId(input,"placeId");
            String label=PlanningSupport.optionalText(input,"label",150), name="", address="";
            if(place!=null) {
                var saved=s.one("SELECT * FROM saved_place WHERE trip_id=? AND id=?",tripId,place);
                if(saved==null) throw fail(404,"PLACE_NOT_FOUND","이 여행에 저장한 장소를 선택해 주세요.");
                name=str(saved,"name"); address=str(saved,"address");
                if(label.isEmpty()) label=name;
            }
            if(label.isEmpty() || !seen.add(label.toLowerCase(Locale.ROOT))) throw ApiException.invalid();
            result.add(map("label",label,"placeId",place,"name",name,"address",address));
        }
        return result;
    }
    private void insertOptions(long poll, List<Map<String,Object>> options) {
        for(var option:options) s.insert("INSERT INTO chat_poll_option(poll_id,label,saved_place_id,place_name,place_address) VALUES(?,?,?,?,?)",poll,option.get("label"),option.get("placeId"),option.get("name"),option.get("address"));
    }
    public Object createPoll(Jwt jwt, String tripId, String partyId, String key, Map<String,Object> body) {
        Inputs.fields(body,"question","options","closesAt","allowMultiple");
        var trip=access(jwt,tripId,partyId,true);
        long actor=s.actor(jwt),tid=n(trip,"id");
        key=PlanningSupport.key(key);
        String question=Inputs.string(body,"question",200,true);
        String digest=p.digest(tid,map("partyId",partyId,"body",body));
        Object replay=p.replay(actor,"chat.poll",key,digest);
        // A retry after the deadline must keep the original ID and show its current state.
        if(replay instanceof Map<?,?> saved) return view(message(tid,partyId,Inputs.id(saved.get("id"))),actor);
        Instant closesAt=deadline(body.get("closesAt"));
        boolean multiple=Boolean.TRUE.equals(Inputs.bool(body,"allowMultiple"));
        var choices=options(body.get("options"),tid);
        if(choices.size()<2) throw ApiException.invalid();
        long id=s.insert("INSERT INTO chat_message(trip_id,party_id,author_id,kind,text,created_at) VALUES(?,?,?,'POLL','',?)",tid,partyId,actor,s.now());
        long poll=s.insert("INSERT INTO chat_poll(message_id,question,closes_at,allow_multiple) VALUES(?,?,?,?)",id,question,closesAt==null?null:Timestamp.from(closesAt),multiple);
        insertOptions(poll,choices);
        pushes.chat(tid,partyId==null?null:Inputs.id(partyId),actor,id);
        Object result=view(message(tid,partyId,id),actor);
        p.remember(actor,"chat.poll",key,digest,result);
        events.publishEvent(new Changed(tid,partyId==null?null:Inputs.id(partyId),id));
        return result;
    }
    public Object changePoll(Jwt jwt, String tripId, String partyId, String pollId, Map<String,Object> body, boolean close) {
        Inputs.fields(body,close?new String[]{"closed"}:new String[]{"optionId","selected"});
        var trip=access(jwt,tripId,partyId,true);
        long tid=n(trip,"id"),actor=s.actor(jwt);
        var poll=s.one("SELECT * FROM chat_poll WHERE id=?",Inputs.id(pollId));
        if(poll==null) throw fail(404,"POLL_NOT_FOUND","투표를 찾을 수 없어요.");
        var message=message(tid,partyId,n(poll,"message_id"));
        if(close) {
            if(!Boolean.TRUE.equals(Inputs.bool(body,"closed"))) throw ApiException.invalid();
            if(!Objects.equals(message.get("author_id"),actor) && !Objects.equals(trip.get("owner_id"),actor)) throw fail(403,"FORBIDDEN","투표 작성자나 여행 방장만 마감할 수 있어요.");
            if(Boolean.TRUE.equals(poll.get("closed")) || "1".equals(str(poll,"closed"))) return view(message,actor);
            s.db.update("UPDATE chat_poll SET closed=TRUE WHERE id=?",n(poll,"id"));
        } else {
            if(pollClosed(poll,s.clock.instant())) throw fail(409,"POLL_CLOSED","마감된 투표예요.");
            Long option=PlanningSupport.optionalId(body,"optionId");
            if(!body.containsKey("optionId")) throw ApiException.invalid();
            if(option!=null && s.one("SELECT id FROM chat_poll_option WHERE poll_id=? AND id=?",n(poll,"id"),option)==null) throw ApiException.invalid();
            boolean multiple=Boolean.TRUE.equals(poll.get("allow_multiple")) || "1".equals(str(poll,"allow_multiple"));
            boolean perOption=body.containsKey("selected");
            if(multiple && !perOption) throw fail(400,"POLL_SELECTION_REQUIRED","복수 선택 투표는 항목의 선택 여부를 함께 보내 주세요.");
            Boolean selected=perOption?Inputs.bool(body,"selected"):null;
            if(perOption && (option==null || selected==null)) throw ApiException.invalid();
            var current=new LinkedHashSet<>(s.db.queryForList("SELECT option_id FROM chat_poll_vote WHERE poll_id=? AND user_id=?",Long.class,n(poll,"id"),actor));
            var target=new LinkedHashSet<>(current);
            if(!perOption) { target.clear(); if(option!=null) target.add(option); }
            else if(selected) { if(!multiple) target.clear(); target.add(option); }
            else target.remove(option);
            if(current.equals(target)) return view(message,actor);
            for(long previous:current) if(!target.contains(previous))
                s.db.update("DELETE FROM chat_poll_vote WHERE poll_id=? AND user_id=? AND option_id=?",n(poll,"id"),actor,previous);
            for(long next:target) if(!current.contains(next))
                s.insert("INSERT INTO chat_poll_vote(poll_id,option_id,user_id) VALUES(?,?,?)",n(poll,"id"),next,actor);
        }
        s.db.update("UPDATE chat_message SET revision=revision+1 WHERE id=?",n(message,"id"));
        events.publishEvent(new Changed(tid,partyId==null?null:Inputs.id(partyId),n(message,"id")));
        return view(message(tid,partyId,n(message,"id")),actor);
    }
    private static boolean pollClosed(Map<String,Object> poll, Instant now) {
        Instant deadline=instant(poll,"closes_at");
        return Boolean.TRUE.equals(poll.get("closed")) || "1".equals(str(poll,"closed")) || (deadline!=null && !deadline.isAfter(now));
    }
    private Instant deadline(Object raw) {
        if(raw==null) return null;
        try {
            if(!(raw instanceof String text) || text.length()>64) throw new IllegalArgumentException();
            Instant value=OffsetDateTime.parse(text).toInstant().truncatedTo(ChronoUnit.MICROS);
            // TIMESTAMP's supported UTC range ends in January 2038 on MySQL.
            if(!value.isAfter(s.clock.instant()) || value.isAfter(Instant.parse("2038-01-19T03:14:07Z"))) throw new IllegalArgumentException();
            return value;
        } catch(RuntimeException error) {
            throw fail(400,"INVALID_POLL_DEADLINE","마감 시간은 현재 이후, 2038년 1월 19일 03:14:07 UTC 이내로 지정해 주세요.");
        }
    }
    public Object recordUpload(Jwt jwt, String tripId, String partyId, String publicId, String url) {
        var trip=access(jwt,tripId,partyId,true);
        long id=s.insert("INSERT INTO chat_image_upload(trip_id,party_id,author_id,public_id,image_url,created_at) VALUES(?,?,?,?,?,?)",n(trip,"id"),partyId,s.actor(jwt),publicId,url,s.now());
        return map("id",Long.toString(id),"url",url);
    }
}
