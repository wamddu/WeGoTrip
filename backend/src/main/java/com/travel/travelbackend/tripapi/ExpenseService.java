package com.travel.travelbackend.tripapi;

import com.travel.travelbackend.userapi.*;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;
import static com.travel.travelbackend.tripapi.TripStore.*;

@Service @Transactional
public class ExpenseService {
    private final PlanningSupport p;
    private final TripStore s;
    public ExpenseService(PlanningSupport p, TripStore s) { this.p=p; this.s=s; }

    private record Input(String title, long amount, LocalDate date, long payerId, SortedMap<Long,Long> shares, Long partyId, String note) {
        Object canonical() {
            return map("title",title,"amount",amount,"date",date.toString(),"payerId",Long.toString(payerId),"shares",shares.entrySet().stream().map(e -> List.of(e.getKey().toString(),e.getValue())).toList(),"partyId",partyId==null?null:partyId.toString(),"note",note);
        }
    }

    static long revision(Object value) {
        if (!(value instanceof String text) || !text.matches("0|[1-9][0-9]{0,18}")) throw ApiException.invalid();
        try { return Long.parseLong(text); } catch (NumberFormatException e) { throw ApiException.invalid(); }
    }

    static void expectedRevision(Map<String,Object> trip, long expected) {
        if (n(trip,"settlement_revision") != expected) throw fail(409,"SETTLEMENT_CHANGED","지출이나 정산 기준이 변경됐어요. 최신 내용을 확인해 주세요.");
    }

    private static Input input(Map<String,Object> body, boolean update) {
        if (update) Inputs.fields(body,"title","amount","date","payerId","shares","partyId","note","settlementRevision");
        else Inputs.fields(body,"title","amount","date","payerId","shares","partyId","note");
        String title=Inputs.string(body,"title",150,true), note=PlanningSupport.optionalText(body,"note",1000,false);
        long amount=TripService.integer(body.get("amount"),1_000_000_000L);
        if (amount==0) throw ApiException.invalid();
        LocalDate date;
        try {
            if (!(body.get("date") instanceof String text) || !text.matches("\\d{4}-\\d{2}-\\d{2}")) throw ApiException.invalid();
            date=LocalDate.parse(text);
            if (date.getYear()<1000) throw ApiException.invalid();
        } catch (RuntimeException e) { throw ApiException.invalid(); }
        long payer=Inputs.id(body.get("payerId"));
        if (!(body.get("shares") instanceof Map<?,?> values) || values.isEmpty() || values.size()>30) throw fail(400,"INVALID_EXPENSE_SHARES","분담 멤버와 금액을 확인해 주세요.");
        var shares=new TreeMap<Long,Long>();
        long sum=0;
        for (var entry:values.entrySet()) {
            long user=Inputs.id(entry.getKey()), share=TripService.integer(entry.getValue(),1_000_000_000L);
            if (shares.put(user,share)!=null) throw ApiException.invalid();
            sum+=share;
        }
        if (sum!=amount) throw fail(400,"INVALID_EXPENSE_SHARES","분담액 합계가 지출 금액과 같아야 해요.");
        return new Input(title,amount,date,payer,shares,PlanningSupport.optionalId(body,"partyId"),note);
    }

    List<Map<String,Object>> members(long tripId) {
        return s.db.queryForList("SELECT tm.id,tm.user_id,tm.joined_at,u.status FROM trip_member tm JOIN `user` u ON u.id=tm.user_id WHERE tm.trip_id=? ORDER BY tm.joined_at,tm.id",tripId);
    }

    private SortedMap<Long,Long> referenceMembers(long tripId, Input input) {
        var memberIds=new TreeMap<Long,Long>();
        for (var member:members(tripId)) if ("ACTIVE".equals(str(member,"status"))) memberIds.put(n(member,"user_id"),n(member,"id"));
        if (!memberIds.containsKey(input.payerId()) || !memberIds.keySet().containsAll(input.shares().keySet())) throw fail(400,"EXPENSE_MEMBER_NOT_IN_TRIP","현재 여행에 참여 중인 멤버만 지정할 수 있어요.");
        if (input.partyId()!=null && s.one("SELECT id FROM trip_party WHERE trip_id=? AND id=? FOR UPDATE",tripId,input.partyId())==null) throw fail(404,"PARTY_NOT_FOUND","파티를 찾을 수 없어요.");
        return memberIds;
    }

    private Map<String,Object> expense(long tripId, long id) {
        var row=s.one("SELECT * FROM expense WHERE trip_id=? AND id=? FOR UPDATE",tripId,id);
        if (row==null) throw fail(404,"EXPENSE_NOT_FOUND","지출을 찾을 수 없어요.");
        return row;
    }

    static BigDecimal decimal(Object value) {
        if (!(value instanceof Number number)) throw fail(409,"EXPENSE_DATA_INVALID","저장된 지출 금액과 분담 기록을 확인해 주세요.");
        return number instanceof BigDecimal decimal ? decimal : new BigDecimal(number.toString());
    }

    static ApiException calculationError(ExpenseSettlementCalculator.InvalidDataException error) {
        return error.unsafeAmount() ? fail(409,"SETTLEMENT_AMOUNT_TOO_LARGE","합산 금액이 표시할 수 있는 정수 범위를 넘었어요.") : fail(409,"EXPENSE_DATA_INVALID","저장된 지출 금액과 분담 기록을 확인해 주세요.");
    }

    private record ReadExpense(Map<String,Object> row, ExpenseSettlementCalculator.Expense calculation, Map<String,Long> shares) {}
    private ReadExpense read(Map<String,Object> row, List<Map<String,Object>> members) {
        var usersByMember=new HashMap<Long,String>();
        for (var member:members) usersByMember.put(n(member,"id"),str(member,"user_id"));
        String payer=usersByMember.get(n(row,"payer_trip_member_id"));
        var shares=new LinkedHashMap<String,BigDecimal>();
        for (var participant:s.db.queryForList("SELECT * FROM expense_participant WHERE expense_id=? ORDER BY id",n(row,"id"))) {
            String user=usersByMember.get(n(participant,"trip_member_id"));
            if (user==null || shares.put(user,decimal(participant.get("amount")))!=null) throw fail(409,"EXPENSE_DATA_INVALID","저장된 지출 금액과 분담 기록을 확인해 주세요.");
        }
        var calculation=new ExpenseSettlementCalculator.Expense(payer,decimal(row.get("amount")),shares);
        try {
            ExpenseSettlementCalculator.calculate("0",members.stream().map(m -> str(m,"user_id")).toList(),List.of(calculation));
            var amounts=new LinkedHashMap<String,Long>();
            for (var entry:shares.entrySet()) amounts.put(entry.getKey(),ExpenseSettlementCalculator.wholeAmount(entry.getValue()));
            return new ReadExpense(row,calculation,amounts);
        } catch (ExpenseSettlementCalculator.InvalidDataException e) { throw calculationError(e); }
    }

    private Object view(Map<String,Object> row, List<Map<String,Object>> members) {
        var read=read(row,members);
        return map("id",str(row,"id"),"title",str(row,"title"),"amount",ExpenseSettlementCalculator.wholeAmount(read.calculation().amount()),"date",str(row,"expense_date"),
            "payerId",read.calculation().payerId(),"shares",read.shares(),"partyId",row.get("party_id")==null?null:str(row,"party_id"),"note",str(row,"note"));
    }

    ExpenseSettlementCalculator.Result calculate(Map<String,Object> trip, List<Map<String,Object>> members) {
        var rows=s.db.queryForList("SELECT * FROM expense WHERE trip_id=? ORDER BY id",n(trip,"id"));
        var expenses=rows.stream().map(row -> read(row,members).calculation()).toList();
        try { return ExpenseSettlementCalculator.calculate(str(trip,"settlement_revision"),members.stream().map(m -> str(m,"user_id")).toList(),expenses); }
        catch (ExpenseSettlementCalculator.InvalidDataException e) { throw calculationError(e); }
    }

    private void shares(long expenseId, Input input, Map<Long,Long> members) {
        s.db.update("DELETE FROM expense_participant WHERE expense_id=?",expenseId);
        for (var entry:input.shares().entrySet()) s.insert("INSERT INTO expense_participant(expense_id,trip_member_id,amount) VALUES(?,?,?)",expenseId,members.get(entry.getKey()),BigDecimal.valueOf(entry.getValue()));
    }

    private String advance(Map<String,Object> trip) {
        long next;
        try { next=Math.addExact(n(trip,"settlement_revision"),1); } catch (ArithmeticException e) { throw fail(409,"SETTLEMENT_VERSION_EXHAUSTED","정산 버전을 더 변경할 수 없어요."); }
        s.db.update("UPDATE trip SET settlement_revision=? WHERE id=?",next,n(trip,"id"));
        trip.put("settlement_revision",next);
        return Long.toString(next);
    }

    public Object list(Jwt jwt, String tripId, String cursor, int limit) {
        var trip=p.access(jwt,tripId,false);
        if (limit<1 || limit>100) throw ApiException.invalid();
        long after=0;
        if (cursor!=null) {
            String[] parts;
            try { parts=new String(Base64.getUrlDecoder().decode(cursor),StandardCharsets.UTF_8).split("\\|",-1); }
            catch (RuntimeException e) { throw ApiException.invalid(); }
            if (parts.length!=4 || !parts[0].equals("expense") || !parts[1].equals(str(trip,"id"))) throw ApiException.invalid();
            expectedRevision(trip,revision(parts[2]));
            after=Inputs.id(parts[3]);
        }
        var rows=s.db.queryForList("SELECT * FROM expense WHERE trip_id=? AND id>? ORDER BY id ASC LIMIT ?",n(trip,"id"),after,limit+1);
        var selected=rows.subList(0,Math.min(limit,rows.size()));
        String next=rows.size()>limit ? Base64.getUrlEncoder().withoutPadding().encodeToString(("expense|"+str(trip,"id")+"|"+str(trip,"settlement_revision")+"|"+n(selected.getLast(),"id")).getBytes(StandardCharsets.UTF_8)) : null;
        var members=members(n(trip,"id"));
        return map("items",selected.stream().map(row -> view(row,members)).toList(),"nextCursor",next,"settlementRevision",str(trip,"settlement_revision"));
    }

    public Object get(Jwt jwt, String tripId, String expenseId) {
        var trip=p.access(jwt,tripId,false);
        return map("expense",view(expense(n(trip,"id"),Inputs.id(expenseId)),members(n(trip,"id"))),"settlementRevision",str(trip,"settlement_revision"));
    }

    public Object create(Jwt jwt, String tripId, String rawKey, Map<String,Object> body) {
        Input input=input(body,false);
        String key=PlanningSupport.key(rawKey);
        var trip=p.access(jwt,tripId,false);
        long actor=s.actor(jwt);
        String digest=p.digest(n(trip,"id"),input.canonical());
        Object replay=p.replay(actor,"expense.create",key,digest);
        if (replay!=null) return replay;
        p.trips.active(trip);
        var members=referenceMembers(n(trip,"id"),input);
        long id=s.insert("INSERT INTO expense(trip_id,payer_trip_member_id,title,amount,expense_date,party_id,note) VALUES(?,?,?,?,?,?,?)",n(trip,"id"),members.get(input.payerId()),input.title(),BigDecimal.valueOf(input.amount()),input.date(),input.partyId(),input.note());
        shares(id,input,members);
        String revision=advance(trip);
        var allMembers=members(n(trip,"id"));
        calculate(trip,allMembers);
        Object response=map("expense",view(expense(n(trip,"id"),id),allMembers),"settlementRevision",revision);
        p.remember(actor,"expense.create",key,digest,response);
        return response;
    }

    public Object update(Jwt jwt, String tripId, String expenseId, String rawKey, Map<String,Object> body) {
        Input input=input(body,true);
        long expected=revision(body.get("settlementRevision")), id=Inputs.id(expenseId);
        String key=PlanningSupport.key(rawKey);
        var trip=p.access(jwt,tripId,false);
        long actor=s.actor(jwt);
        String digest=p.digest(n(trip,"id"),map("expenseId",Long.toString(id),"settlementRevision",Long.toString(expected),"input",input.canonical()));
        Object replay=p.replay(actor,"expense.update",key,digest);
        if (replay!=null) return replay;
        p.trips.active(trip); expectedRevision(trip,expected);
        var row=expense(n(trip,"id"),id);
        var members=referenceMembers(n(trip,"id"),input);
        s.db.update("UPDATE expense SET payer_trip_member_id=?,title=?,amount=?,expense_date=?,party_id=?,note=? WHERE id=?",members.get(input.payerId()),input.title(),BigDecimal.valueOf(input.amount()),input.date(),input.partyId(),input.note(),n(row,"id"));
        shares(id,input,members);
        String revision=advance(trip);
        var allMembers=members(n(trip,"id"));
        calculate(trip,allMembers);
        Object response=map("expense",view(expense(n(trip,"id"),id),allMembers),"settlementRevision",revision);
        p.remember(actor,"expense.update",key,digest,200,response);
        return response;
    }

    public Object delete(Jwt jwt, String tripId, String expenseId, String rawKey, String rawRevision) {
        long expected=revision(rawRevision), id=Inputs.id(expenseId);
        String key=PlanningSupport.key(rawKey);
        var trip=p.access(jwt,tripId,false);
        long actor=s.actor(jwt);
        String digest=p.digest(n(trip,"id"),map("expenseId",Long.toString(id),"settlementRevision",Long.toString(expected)));
        Object replay=p.replay(actor,"expense.delete",key,digest);
        if (replay!=null) return replay;
        p.trips.active(trip); expectedRevision(trip,expected);
        expense(n(trip,"id"),id);
        s.db.update("DELETE FROM expense_participant WHERE expense_id=?",id);
        s.db.update("DELETE FROM expense WHERE id=?",id);
        Object response=map("settlementRevision",advance(trip));
        p.remember(actor,"expense.delete",key,digest,200,response);
        return response;
    }
}
