package com.travel.travelbackend.tripapi;

import com.travel.travelbackend.userapi.*;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.util.*;
import static com.travel.travelbackend.tripapi.TripStore.*;

@Service @Transactional
public class SettlementService {
    private final PlanningSupport p;
    private final TripStore s;
    private final ExpenseService expenses;
    public SettlementService(PlanningSupport p, TripStore s, ExpenseService expenses) { this.p=p; this.s=s; this.expenses=expenses; }

    private static boolean completed(Object value) {
        if (value instanceof Boolean bool) return bool;
        if (value instanceof Number number && (number.longValue()==0 || number.longValue()==1) && number.doubleValue()==number.longValue()) return number.longValue()==1;
        throw fail(409,"EXPENSE_DATA_INVALID","저장된 완료 기록을 확인해 주세요.");
    }

    private static Object view(String revision, ExpenseSettlementCalculator.Transfer transfer, boolean completed, long version) {
        return map("settlementRevision",revision,"from",transfer.from(),"to",transfer.to(),"amount",transfer.amount(),"key",transfer.key(),"completed",completed,"confirmationVersion",Long.toString(version));
    }

    public Object get(Jwt jwt, String tripId) {
        var trip=p.access(jwt,tripId,false);
        var members=expenses.members(n(trip,"id"));
        var result=expenses.calculate(trip,members);
        var usersByMember=new HashMap<Long,String>();
        for (var member:members) usersByMember.put(n(member,"id"),str(member,"user_id"));
        var candidates=new HashMap<String,ExpenseSettlementCalculator.Transfer>();
        for (var transfer:result.transfers()) candidates.put(transfer.from()+":"+transfer.to(),transfer);
        var confirmations=new HashMap<String,Map<String,Object>>();
        for (var row:s.db.queryForList("SELECT * FROM settlement_confirmation WHERE trip_id=? AND settlement_revision=?",n(trip,"id"),n(trip,"settlement_revision"))) {
            String from=usersByMember.get(n(row,"from_trip_member_id")), to=usersByMember.get(n(row,"to_trip_member_id"));
            String actor=usersByMember.get(n(row,"updated_by_trip_member_id"));
            var transfer=candidates.get(from+":"+to);
            long amount;
            try { amount=ExpenseSettlementCalculator.wholeAmount(ExpenseService.decimal(row.get("amount"))); }
            catch (ExpenseSettlementCalculator.InvalidDataException e) { throw ExpenseService.calculationError(e); }
            // Preserve readable legacy confirmations recorded by senders before receiver-only writes.
            if (from==null || to==null || actor==null || (!actor.equals(from) && !actor.equals(to)) || transfer==null || transfer.amount()!=amount || n(row,"version")<0)
                throw fail(409,"EXPENSE_DATA_INVALID","저장된 완료 기록을 확인해 주세요.");
            completed(row.get("completed"));
            confirmations.put(from+":"+to,row);
        }
        var transfers=new ArrayList<Object>();
        for (var transfer:result.transfers()) {
            var row=confirmations.get(transfer.from()+":"+transfer.to());
            transfers.add(map("from",transfer.from(),"to",transfer.to(),"amount",transfer.amount(),"key",transfer.key(),"completed",row!=null && completed(row.get("completed")),"confirmationVersion",row==null?"0":str(row,"version")));
        }
        return map("settlementRevision",result.settlementRevision(),"total",result.total(),"balances",result.balances(),"transfers",transfers);
    }

    public Object confirm(Jwt jwt, String tripId, String rawKey, Map<String,Object> body) {
        Inputs.fields(body,"settlementRevision","fromUserId","toUserId","amount","completed","confirmationVersion");
        long expected=ExpenseService.revision(body.get("settlementRevision")), expectedVersion=ExpenseService.revision(body.get("confirmationVersion"));
        long from=Inputs.id(body.get("fromUserId")), to=Inputs.id(body.get("toUserId"));
        long amount=TripService.integer(body.get("amount"),ExpenseSettlementCalculator.MAX_SAFE_INTEGER);
        if (from==to || amount==0 || !(body.get("completed") instanceof Boolean)) throw ApiException.invalid();
        boolean desired=(Boolean) body.get("completed");
        String key=PlanningSupport.key(rawKey);
        var trip=p.access(jwt,tripId,false);
        long actor=s.actor(jwt);
        // Check request identity before replay; current calculated routes may have changed.
        if (actor!=to) throw fail(403,"SETTLEMENT_RECEIVER_REQUIRED","송금을 받는 사람만 완료 상태를 변경할 수 있어요.");
        String digest=p.digest(n(trip,"id"),map("settlementRevision",Long.toString(expected),"fromUserId",Long.toString(from),"toUserId",Long.toString(to),"amount",amount,"completed",desired,"confirmationVersion",Long.toString(expectedVersion)));
        Object replay=p.replay(actor,"settlement.confirm",key,digest);
        if (replay!=null) return replay;
        // Confirmation is allowed for archived trips, unlike expense writes.
        ExpenseService.expectedRevision(trip,expected);
        var members=expenses.members(n(trip,"id"));
        var memberIds=new HashMap<String,Long>();
        for (var member:members) memberIds.put(str(member,"user_id"),n(member,"id"));
        String fromUser=Long.toString(from), toUser=Long.toString(to);
        if (!memberIds.containsKey(fromUser) || !memberIds.containsKey(toUser)) throw fail(404,"TRANSFER_NOT_FOUND","현재 정산에 해당 송금이 없어요.");
        var result=expenses.calculate(trip,members);
        var transfer=result.transfers().stream().filter(t -> t.from().equals(fromUser) && t.to().equals(toUser) && t.amount()==amount).findFirst()
            .orElseThrow(() -> fail(404,"TRANSFER_NOT_FOUND","현재 정산에 해당 송금이 없어요."));
        var row=s.one("SELECT * FROM settlement_confirmation WHERE trip_id=? AND settlement_revision=? AND from_trip_member_id=? AND to_trip_member_id=? FOR UPDATE",
            n(trip,"id"),expected,memberIds.get(fromUser),memberIds.get(toUser));
        long version=row==null?0:n(row,"version");
        if (version!=expectedVersion) throw fail(409,"CONFIRMATION_CHANGED","완료 상태가 변경됐어요. 최신 상태를 확인해 주세요.");
        if (row!=null) {
            try {
                if (ExpenseSettlementCalculator.wholeAmount(ExpenseService.decimal(row.get("amount")))!=amount) throw fail(409,"EXPENSE_DATA_INVALID","저장된 완료 기록을 확인해 주세요.");
            } catch (ExpenseSettlementCalculator.InvalidDataException e) { throw ExpenseService.calculationError(e); }
        }
        boolean current=row!=null && completed(row.get("completed"));
        if (desired!=current) {
            if (row==null) {
                version=1;
                s.insert("INSERT INTO settlement_confirmation(trip_id,settlement_revision,from_trip_member_id,to_trip_member_id,amount,completed,version,updated_by_trip_member_id,updated_at) VALUES(?,?,?,?,?,TRUE,1,?,?)",
                    n(trip,"id"),expected,memberIds.get(fromUser),memberIds.get(toUser),BigDecimal.valueOf(amount),memberIds.get(Long.toString(actor)),s.now());
            } else {
                try { version=Math.addExact(version,1); } catch (ArithmeticException e) { throw fail(409,"CONFIRMATION_VERSION_EXHAUSTED","완료 버전을 더 변경할 수 없어요."); }
                s.db.update("UPDATE settlement_confirmation SET completed=?,version=?,updated_by_trip_member_id=?,updated_at=? WHERE id=?",desired,version,memberIds.get(Long.toString(actor)),s.now(),n(row,"id"));
            }
        }
        Object response=view(Long.toString(expected),transfer,desired,version);
        p.remember(actor,"settlement.confirm",key,digest,200,response);
        return response;
    }
}
