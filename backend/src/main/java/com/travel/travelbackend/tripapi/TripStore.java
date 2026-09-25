package com.travel.travelbackend.tripapi;

import com.travel.travelbackend.userapi.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** SQL stays parameterized; all public service operations own a transaction. */
@Component
public class TripStore {
    final JdbcTemplate db;
    final Clock clock;
    public TripStore(JdbcTemplate db, Clock clock) { this.db=db; this.clock=clock; }
    Map<String,Object> one(String sql, Object... args) {
        var rows=db.queryForList(sql,args); return rows.isEmpty()?null:rows.getFirst();
    }
    long insert(String sql, Object... args) {
        var keys=new GeneratedKeyHolder();
        db.update(c -> {var s=c.prepareStatement(sql,new String[]{"id"});
            for(int i=0;i<args.length;i++) s.setObject(i+1,args[i]); return s;}, keys);
        return Objects.requireNonNull(keys.getKey()).longValue();
    }
    static long n(Map<String,Object> row,String key) {return ((Number)row.get(key)).longValue();}
    static String str(Map<String,Object> row,String key) {return Objects.toString(row.get(key),"");}
    static Instant instant(Map<String,Object> row,String key) {
        Object v=row.get(key); if(v==null)return null;
        if(v instanceof Timestamp t)return t.toInstant();
        if(v instanceof OffsetDateTime t)return t.toInstant();
        throw new IllegalStateException("Unsupported timestamp");
    }
    Timestamp now(){return Timestamp.from(clock.instant());}
    Timestamp expires(){return Timestamp.from(clock.instant().plus(Duration.ofDays(7)));}
    static ApiException fail(int status,String code,String message){return new ApiException(status,code,message);}
    static String hash(String value){
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}
        catch(Exception e){throw new IllegalStateException(e);}
    }
    long actor(Jwt jwt){if(jwt==null)throw ApiException.unauthorized();return Inputs.id(jwt.getSubject());}
    long authenticate(Jwt jwt, Long... others) {
        long id=actor(jwt);var ids=new TreeSet<Long>(Arrays.asList(others));ids.add(id);
        Map<String,Object> me=null;
        for(long target:ids){var row=one("SELECT id,status,token_version FROM `user` WHERE id=? FOR UPDATE",target);
            if(row==null || !"ACTIVE".equals(str(row,"status"))) {
                if(target==id)throw fail(403,"ACCOUNT_UNAVAILABLE","이용할 수 없는 계정입니다.");
                throw fail(404,"USER_NOT_FOUND","회원을 찾을 수 없어요.");
            }
            if(target==id)me=row;
        }
        Object version=jwt.getClaims().get("tokenVersion");
        if(!(version instanceof Number v)||v.doubleValue()!=v.longValue()||v.longValue()!=n(me,"token_version"))throw ApiException.unauthorized();
        return id;
    }
    Map<String,Object> profile(long id){
        var row=one("SELECT id,name,status FROM `user` WHERE id=?",id);
        return Map.of("id",Long.toString(id),"name",row!=null&&"ACTIVE".equals(str(row,"status"))?str(row,"name"):"탈퇴한 사용자");
    }
    static Map<String,Object> map(Object... pairs){var m=new LinkedHashMap<String,Object>();for(int i=0;i<pairs.length;i+=2)m.put((String)pairs[i],pairs[i+1]);return m;}
    record Page(int limit, Instant time, long id) {}
    Page page(String cursor,int limit){
        if(limit<1||limit>100)throw ApiException.invalid();
        if(cursor==null)return new Page(limit,null,0);
        try{String[] parts=new String(Base64.getUrlDecoder().decode(cursor),StandardCharsets.UTF_8).split("\\|",-1);
            if(parts.length!=2)throw ApiException.invalid();return new Page(limit,Instant.parse(parts[0]),Inputs.id(parts[1]));
        }catch(RuntimeException e){throw ApiException.invalid();}
    }
    List<Map<String,Object>> rows(String table,String where,List<Object> args,Page p,String time,boolean asc){
        String cmp=asc?">":"<";var values=new ArrayList<>(args);
        if(p.time()!=null){where+=" AND ("+time+cmp+"? OR ("+time+"=? AND id"+cmp+"?))";
            values.add(Timestamp.from(p.time()));values.add(Timestamp.from(p.time()));values.add(p.id());}
        values.add(p.limit()+1);
        return db.queryForList("SELECT * FROM "+table+" WHERE "+where+" ORDER BY "+time+(asc?" ASC":" DESC")+",id"+(asc?" ASC":" DESC")+" LIMIT ?",values.toArray());
    }
    Map<String,Object> pageResult(List<Map<String,Object>> rows,Page p,String time,java.util.function.Function<Map<String,Object>,Object> view){
        boolean more=rows.size()>p.limit();var selected=rows.subList(0,Math.min(rows.size(),p.limit()));String cursor=null;
        if(more){var last=selected.getLast();cursor=Base64.getUrlEncoder().withoutPadding().encodeToString((instant(last,time)+"|"+n(last,"id")).getBytes(StandardCharsets.UTF_8));}
        return map("items",selected.stream().map(view).toList(),"nextCursor",cursor);
    }
    static String choice(String value,String... choices){if(!Set.of(choices).contains(value))throw ApiException.invalid();return value;}
}
