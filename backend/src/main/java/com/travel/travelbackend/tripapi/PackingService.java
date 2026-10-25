package com.travel.travelbackend.tripapi;

import com.travel.travelbackend.userapi.*;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static com.travel.travelbackend.tripapi.TripStore.*;

/** Packing uses hashes of existing fields for conflict checks; no schema version is required. */
@Service @Transactional
public class PackingService {
    private final PlanningSupport p;
    private final TripStore s;
    public PackingService(PlanningSupport p, TripStore s) { this.p=p; this.s=s; }

    private record Input(String title, Long ownerId) {
        Object canonical() { return map("title",title,"ownerId",ownerId==null?null:ownerId.toString()); }
    }

    private static Input input(Map<String,Object> body, boolean update) {
        if (update) Inputs.fields(body,"title","ownerId","expectedStateToken");
        else Inputs.fields(body,"title","ownerId");
        String title=Inputs.string(body,"title",150,true);
        Long ownerId=PlanningSupport.optionalId(body,"ownerId");
        if (update && ownerId==null)
            throw fail(400,"PACKING_ASSIGNMENT_REQUIRED","준비물을 챙길 담당자를 지정해 주세요.");
        return new Input(title,ownerId);
    }

    private static String token(Object value) {
        if (!(value instanceof String text) || !text.matches("[0-9a-f]{64}")) throw ApiException.invalid();
        return text;
    }

    private static boolean done(Map<String,Object> row) {
        Object value=row.get("done");
        return value instanceof Boolean flag ? flag : ((Number)value).intValue()!=0;
    }

    private String stateToken(Map<String,Object> row) {
        return p.digest(n(row,"trip_id"),map("id",str(row,"id"),"title",str(row,"title"),
            "ownerTripMemberId",row.get("owner_trip_member_id")==null?null:str(row,"owner_trip_member_id"),"done",done(row)));
    }

    private Object view(Map<String,Object> row) {
        String ownerId=null;
        if (row.get("owner_trip_member_id")!=null) {
            var member=s.one("SELECT user_id FROM trip_member WHERE id=?",n(row,"owner_trip_member_id"));
            if (member!=null) ownerId=str(member,"user_id");
        }
        return view(row,ownerId);
    }

    private Object view(Map<String,Object> row, String ownerId) {
        return map("id",str(row,"id"),"title",str(row,"title"),"ownerId",ownerId,"done",done(row),"stateToken",stateToken(row));
    }

    private Map<String,Object> item(long tripId, long itemId) {
        var row=s.one("SELECT * FROM packing_item WHERE trip_id=? AND id=? FOR UPDATE",tripId,itemId);
        if (row==null) throw fail(404,"PACKING_ITEM_NOT_FOUND","준비물을 찾을 수 없어요.");
        return row;
    }

    private Long owner(long tripId, Long userId) {
        if (userId==null) return null;
        var member=s.one("SELECT tm.id FROM trip_member tm JOIN `user` u ON u.id=tm.user_id WHERE tm.trip_id=? AND tm.user_id=? AND u.status='ACTIVE'",tripId,userId);
        if (member==null) throw fail(400,"PACKING_MEMBER_NOT_IN_TRIP","현재 여행에 참여 중인 멤버만 담당자로 지정할 수 있어요.");
        return n(member,"id");
    }

    private void expected(Map<String,Object> row, String expected) {
        if (!stateToken(row).equals(expected)) throw fail(409,"PACKING_ITEM_CONFLICT","다른 멤버가 준비물을 변경했어요. 최신 내용을 확인한 뒤 다시 저장해 주세요.");
    }

    public Object list(Jwt jwt, String rawTripId, String cursor, int limit) {
        var trip=p.access(jwt,rawTripId,false);
        if (limit<1 || limit>100) throw ApiException.invalid();
        long tripId=n(trip,"id");
        // The trip lock serializes all packing writes and membership removal while hashing/pages are read.
        var rows=s.db.queryForList("SELECT * FROM packing_item WHERE trip_id=? ORDER BY id ASC",tripId);
        String checklistToken=p.digest(tripId,rows.stream().map(this::stateToken).toList());
        long after=0;
        if (cursor!=null) {
            String[] parts;
            try { parts=new String(Base64.getUrlDecoder().decode(cursor),StandardCharsets.UTF_8).split("\\|",-1); }
            catch (RuntimeException e) { throw ApiException.invalid(); }
            if (parts.length!=4 || !"packing".equals(parts[0]) || !str(trip,"id").equals(parts[1])) throw ApiException.invalid();
            String expected=token(parts[2]);
            after=Inputs.id(parts[3]);
            if (!checklistToken.equals(expected)) throw fail(409,"PACKING_LIST_CHANGED","준비물 목록이 변경됐어요. 최신 목록을 다시 불러와 주세요.");
        }
        long afterId=after;
        var remaining=rows.stream().filter(row -> n(row,"id")>afterId).limit(limit+1L).toList();
        var selected=remaining.subList(0,Math.min(limit,remaining.size()));
        String next=remaining.size()>limit ? Base64.getUrlEncoder().withoutPadding().encodeToString(
            ("packing|"+tripId+"|"+checklistToken+"|"+n(selected.getLast(),"id")).getBytes(StandardCharsets.UTF_8)) : null;
        var owners=new HashMap<Long,String>();
        for (var member:s.db.queryForList("SELECT id,user_id FROM trip_member WHERE trip_id=?",tripId)) owners.put(n(member,"id"),str(member,"user_id"));
        return map("items",selected.stream().map(row -> view(row,row.get("owner_trip_member_id")==null?null:owners.get(n(row,"owner_trip_member_id")))).toList(),
            "nextCursor",next,"checklistStateToken",checklistToken);
    }

    public Object get(Jwt jwt, String tripId, String itemId) {
        var trip=p.access(jwt,tripId,false);
        return view(item(n(trip,"id"),Inputs.id(itemId)));
    }

    public Object create(Jwt jwt, String tripId, String rawKey, Map<String,Object> body) {
        Input input=input(body,false);
        String key=PlanningSupport.key(rawKey);
        var trip=p.access(jwt,tripId,false);
        long actor=s.actor(jwt), id=n(trip,"id");
        String digest=p.digest(id,input.canonical());
        Object replay=p.replay(actor,"packing.create",key,digest);
        if (replay!=null) {
            // Older cached create responses contain one item rather than the batch envelope.
            if (replay instanceof Map<?,?> saved && saved.containsKey("id") && !saved.containsKey("items")) {
                if (saved.get("ownerId")==null)
                    throw fail(409,"PACKING_ASSIGNMENT_REQUIRED","담당자가 없는 준비물 정보는 사용할 수 없어요. 준비물을 새로 등록해 주세요.");
                return map("items",List.of(replay));
            }
            return replay;
        }
        p.trips.active(trip);
        var owners=input.ownerId()==null
            ? s.db.queryForList("SELECT tm.id FROM trip_member tm JOIN `user` u ON u.id=tm.user_id WHERE tm.trip_id=? AND u.status='ACTIVE' ORDER BY tm.id",id).stream().map(member -> n(member,"id")).toList()
            : List.of(owner(id,input.ownerId()));
        // Capture the current membership under the trip lock, then commit every personal copy together.
        var created=new ArrayList<Object>();
        for (long memberId:owners) {
            long itemId=s.insert("INSERT INTO packing_item(trip_id,owner_trip_member_id,title,done) VALUES(?,?,?,?)",id,memberId,input.title(),false);
            created.add(view(item(id,itemId)));
        }
        Object response=map("items",created);
        p.remember(actor,"packing.create",key,digest,response);
        return response;
    }

    public Object update(Jwt jwt, String tripId, String itemId, String rawKey, Map<String,Object> body) {
        Input input=input(body,true);
        String expected=token(body.get("expectedStateToken")), key=PlanningSupport.key(rawKey);
        long id=Inputs.id(itemId);
        var trip=p.access(jwt,tripId,false);
        long actor=s.actor(jwt), parent=n(trip,"id");
        String digest=p.digest(parent,map("itemId",Long.toString(id),"expectedStateToken",expected,"input",input.canonical()));
        Object replay=p.replay(actor,"packing.update",key,digest);
        if (replay!=null) return replay;
        p.trips.active(trip);
        var row=item(parent,id); expected(row,expected);
        // A tick without an assigned owner does not confirm that the new owner packed their copy.
        boolean completed=row.get("owner_trip_member_id")!=null && done(row);
        s.db.update("UPDATE packing_item SET title=?,owner_trip_member_id=?,done=? WHERE id=?",input.title(),owner(parent,input.ownerId()),completed,id);
        Object response=view(item(parent,id));
        p.remember(actor,"packing.update",key,digest,200,response);
        return response;
    }

    public Object complete(Jwt jwt, String tripId, String itemId, String rawKey, Map<String,Object> body) {
        Inputs.fields(body,"done","expectedStateToken");
        Boolean done=Inputs.bool(body,"done");
        if (done==null) throw ApiException.invalid();
        String expected=token(body.get("expectedStateToken")), key=PlanningSupport.key(rawKey);
        long id=Inputs.id(itemId);
        var trip=p.access(jwt,tripId,false);
        long actor=s.actor(jwt), parent=n(trip,"id");
        String digest=p.digest(parent,map("itemId",Long.toString(id),"expectedStateToken",expected,"done",done));
        var row=s.one("SELECT * FROM packing_item WHERE trip_id=? AND id=? FOR UPDATE",parent,id);
        // Recheck the current assignment before replaying a successful completion request.
        if (row!=null && row.get("owner_trip_member_id")==null)
            throw fail(409,"PACKING_ASSIGNMENT_REQUIRED","준비물을 챙길 담당자를 지정해 주세요.");
        if (row!=null && row.get("owner_trip_member_id")!=null) {
            var owner=s.one("SELECT user_id FROM trip_member WHERE id=?",n(row,"owner_trip_member_id"));
            if (owner==null || n(owner,"user_id")!=actor)
                throw fail(403,"PACKING_OWNER_REQUIRED","배정된 준비물은 담당자만 완료 상태를 변경할 수 있어요.");
        }
        Object replay=p.replay(actor,"packing.complete",key,digest);
        if (replay!=null) return replay;
        p.trips.active(trip);
        if (row==null) throw fail(404,"PACKING_ITEM_NOT_FOUND","준비물을 찾을 수 없어요.");
        expected(row,expected);
        s.db.update("UPDATE packing_item SET done=? WHERE id=?",done,id);
        Object response=view(item(parent,id));
        p.remember(actor,"packing.complete",key,digest,200,response);
        return response;
    }

    public Object delete(Jwt jwt, String tripId, String itemId, String rawKey, String rawExpected) {
        String expected=token(rawExpected), key=PlanningSupport.key(rawKey);
        long id=Inputs.id(itemId);
        var trip=p.access(jwt,tripId,false);
        long actor=s.actor(jwt), parent=n(trip,"id");
        String digest=p.digest(parent,map("itemId",Long.toString(id),"expectedStateToken",expected));
        Object replay=p.replay(actor,"packing.delete",key,digest);
        if (replay!=null) return replay;
        p.trips.active(trip);
        var row=item(parent,id); expected(row,expected);
        s.db.update("DELETE FROM packing_item WHERE id=?",id);
        Object response=map("deletedId",Long.toString(id));
        p.remember(actor,"packing.delete",key,digest,200,response);
        return response;
    }
}
