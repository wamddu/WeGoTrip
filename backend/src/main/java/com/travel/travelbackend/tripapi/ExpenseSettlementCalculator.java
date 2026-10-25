package com.travel.travelbackend.tripapi;

import java.math.BigDecimal;
import java.util.*;

/** Exact KRW calculations. Member order is supplied by joined_at,id from the store. */
public final class ExpenseSettlementCalculator {
    public static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;
    private ExpenseSettlementCalculator() {}

    public record Expense(String payerId, BigDecimal amount, Map<String,BigDecimal> shares) {}
    public record Balance(long paid, long share, long balance) {}
    public record Transfer(String from, String to, long amount, String key) {}
    public record Result(String settlementRevision, long total, Map<String,Balance> balances, List<Transfer> transfers) {}

    public static final class InvalidDataException extends IllegalArgumentException {
        private final boolean unsafeAmount;
        InvalidDataException(String message, boolean unsafeAmount) { super(message); this.unsafeAmount = unsafeAmount; }
        public boolean unsafeAmount() { return unsafeAmount; }
    }

    public static long wholeAmount(BigDecimal value) {
        if (value == null || value.signum() < 0) throw invalid("Amounts must be nonnegative integers");
        final long amount;
        try { amount = value.longValueExact(); }
        catch (ArithmeticException e) {
            if (value.stripTrailingZeros().scale() > 0) throw invalid("Fractional KRW amounts are unsupported");
            throw unsafe();
        }
        if (amount > MAX_SAFE_INTEGER) throw unsafe();
        return amount;
    }

    private static InvalidDataException invalid(String message) { return new InvalidDataException(message,false); }
    private static InvalidDataException unsafe() { return new InvalidDataException("Amount exceeds JavaScript's safe integer range",true); }
    private static long add(long a, long b) {
        long total;
        try { total = Math.addExact(a,b); } catch (ArithmeticException e) { throw unsafe(); }
        if (total > MAX_SAFE_INTEGER) throw unsafe();
        return total;
    }

    public static Result calculate(String revision, List<String> orderedUserIds, List<Expense> expenses) {
        if (revision == null || !revision.matches("0|[1-9][0-9]{0,18}") || orderedUserIds == null || expenses == null) throw invalid("Invalid calculation input");
        var amounts = new LinkedHashMap<String,long[]>();
        for (String id : orderedUserIds) {
            if (id == null || id.isBlank() || amounts.putIfAbsent(id,new long[2]) != null) throw invalid("Duplicate or missing member");
        }
        long total = 0;
        for (var expense : expenses) {
            if (expense == null || !amounts.containsKey(expense.payerId()) || expense.shares() == null || expense.shares().isEmpty()) throw invalid("Unknown payer or empty shares");
            long paid = wholeAmount(expense.amount());
            if (paid == 0) throw invalid("Expense amount must be positive");
            long sum = 0;
            for (var entry : expense.shares().entrySet()) {
                if (!amounts.containsKey(entry.getKey())) throw invalid("Unknown participant");
                long share = wholeAmount(entry.getValue());
                sum = add(sum,share);
                var member = amounts.get(entry.getKey());
                member[1] = add(member[1],share);
            }
            if (sum != paid) throw invalid("Shares do not equal the expense amount");
            total = add(total,paid);
            var payer = amounts.get(expense.payerId());
            payer[0] = add(payer[0],paid);
        }
        var balances = new LinkedHashMap<String,Balance>();
        var debtors = new ArrayList<String>();
        var creditors = new ArrayList<String>();
        var outstanding = new HashMap<String,Long>();
        long balanceSum = 0;
        for (var entry : amounts.entrySet()) {
            long paid = entry.getValue()[0], share = entry.getValue()[1], balance = paid-share;
            balanceSum = Math.addExact(balanceSum,balance);
            balances.put(entry.getKey(),new Balance(paid,share,balance));
            if (balance < 0) debtors.add(entry.getKey());
            if (balance > 0) creditors.add(entry.getKey());
            outstanding.put(entry.getKey(),Math.abs(balance));
        }
        if (balanceSum != 0) throw invalid("Balances do not sum to zero");
        var transfers = new ArrayList<Transfer>();
        for (String from : debtors) for (String to : creditors) {
            long amount = Math.min(outstanding.get(from),outstanding.get(to));
            if (amount == 0) continue;
            transfers.add(new Transfer(from,to,amount,revision+":"+from+":"+to+":"+amount));
            outstanding.put(from,outstanding.get(from)-amount);
            outstanding.put(to,outstanding.get(to)-amount);
        }
        return new Result(revision,total,Collections.unmodifiableMap(balances),List.copyOf(transfers));
    }
}
