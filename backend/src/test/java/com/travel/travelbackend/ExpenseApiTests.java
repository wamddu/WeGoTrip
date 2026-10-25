package com.travel.travelbackend;

import com.jayway.jsonpath.JsonPath;
import com.travel.travelbackend.entity.User;
import com.travel.travelbackend.repository.UserRepository;
import com.travel.travelbackend.tripapi.ExpenseSettlementCalculator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.math.BigDecimal;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:expense-api;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ExpenseApiTests {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    String a, b, c, outsider, trip, expenses, settlement;

    // The optional MySQL run is supplied by the caller using an isolated, empty schema clone.
    // Credentials are never included in assertions or printed by this test.
    @DynamicPropertySource
    static void isolatedMySql(DynamicPropertyRegistry properties) {
        String url = System.getenv("EXPENSE_MYSQL_URL");
        if (url == null || url.isBlank()) return;
        requireIsolatedMySqlUrl(url);
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.username", () -> Objects.requireNonNullElse(System.getenv("EXPENSE_MYSQL_USERNAME"), ""));
        properties.add("spring.datasource.password", () -> Objects.requireNonNullElse(System.getenv("EXPENSE_MYSQL_PASSWORD"), ""));
        properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "none");
        properties.add("spring.sql.init.mode", () -> "never");
    }

    static void requireIsolatedMySqlUrl(String url) {
        boolean allowed = false;
        try {
            if (url.startsWith("jdbc:mysql://")) {
                URI target = URI.create(url.substring("jdbc:".length()));
                String host = target.getHost();
                boolean local = "127.0.0.1".equals(host) || "localhost".equalsIgnoreCase(host)
                    || "::1".equals(host) || "[::1]".equals(host);
                allowed = local && target.getPort() > 0 && target.getPort() <= 65535
                    && target.getRawUserInfo() == null && target.getRawFragment() == null
                    && target.getRawPath() != null
                    && target.getRawPath().matches("/codex_expense_009_test(?:_[A-Za-z0-9_]+)?");
            }
        } catch (RuntimeException ignored) {
            // Do not attach a parsing exception: it can contain the original URL or credentials.
        }
        if (!allowed) throw new IllegalArgumentException("EXPENSE_MYSQL_URL must target the isolated local expense test database.");
    }

    @BeforeEach
    void setup() throws Exception {
        for (String table : List.of("settlement_confirmation", "expense_participant", "expense", "itinerary_item", "saved_place", "trip_party_member", "trip_party", "api_rate_limit", "api_idempotency", "trip_invite_code", "trip_invitation", "trip_member", "trip", "friendship", "friend_request"))
            db.update("DELETE FROM " + table);
        users.deleteAll();
        a = user("expense-a"); b = user("expense-b"); c = user("expense-c"); outsider = user("expense-outsider");
        trip = newTrip();
        for (String person : List.of(b, c))
            db.update("INSERT INTO trip_member(trip_id,user_id,joined_at) VALUES(?,?,CURRENT_TIMESTAMP)", trip, person);
        expenses = "/api/v1/trips/" + trip + "/expenses";
        settlement = "/api/v1/trips/" + trip + "/settlement";
    }

    String user(String name) {
        return users.saveAndFlush(new User(name, name + "@example.invalid", null, Instant.now())).getId().toString();
    }
    String key() { return UUID.randomUUID().toString(); }
    MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder request, String who) {
        return request.with(jwt().jwt(j -> j.subject(who).claim("tokenVersion", 0).claim("auth_time", Instant.now().getEpochSecond())));
    }
    static Map<String, Object> map(Object... values) {
        var result = new LinkedHashMap<String, Object>();
        for (int i = 0; i < values.length; i += 2) result.put((String) values[i], values[i + 1]);
        return result;
    }
    String content(Object body) { return json.writeValueAsString(body); }
    <T> T field(ResultActions response, String name) throws Exception {
        return JsonPath.read(response.andReturn().getResponse().getContentAsString(), "$.data." + name);
    }
    String newTrip() throws Exception {
        return field(mvc.perform(auth(post("/api/v1/trips"), a).header("Idempotency-Key", key()).contentType("application/json")
            .content(content(map("title", "Busan", "destination", "Busan", "startDate", "2026-10-10", "endDate", "2026-10-12", "budget", 0, "inviteeIds", List.of()))))
            .andExpect(status().isCreated()), "trip.id");
    }
    Map<String, Object> body(long amount, Map<String, Object> shares) {
        return map("title", "공동 식사", "amount", amount, "date", "2026-10-02", "payerId", a, "shares", shares, "partyId", null, "note", "메모 그대로 공유");
    }
    Map<String, Object> body() { return body(100, map(b, 100)); }
    ResultActions create(String who, String requestKey, Map<String, Object> body) throws Exception {
        return mvc.perform(auth(post(expenses), who).header("Idempotency-Key", requestKey).contentType("application/json").content(content(body)));
    }
    String expense() throws Exception { return field(create(a, key(), body()).andExpect(status().isCreated()), "expense.id"); }
    ResultActions update(String id, String who, String requestKey, String revision, Map<String, Object> body) throws Exception {
        var input = new LinkedHashMap<>(body); input.put("settlementRevision", revision);
        return mvc.perform(auth(put(expenses + "/" + id), who).header("Idempotency-Key", requestKey).contentType("application/json").content(content(input)));
    }
    ResultActions remove(String id, String who, String requestKey, String revision) throws Exception {
        return mvc.perform(auth(delete(expenses + "/" + id).param("settlementRevision", revision), who).header("Idempotency-Key", requestKey));
    }
    Map<String, Object> transfer() throws Exception {
        return field(mvc.perform(auth(get(settlement), a)).andExpect(status().isOk()), "transfers[0]");
    }
    Map<String, Object> completion(Map<String, Object> transfer, String revision, boolean completed, String version) {
        return map("settlementRevision", revision, "fromUserId", transfer.get("from"), "toUserId", transfer.get("to"), "amount", transfer.get("amount"), "completed", completed, "confirmationVersion", version);
    }
    ResultActions confirm(String who, String requestKey, Map<String, Object> input) throws Exception {
        return mvc.perform(auth(put(settlement + "/confirmations"), who).header("Idempotency-Key", requestKey).contentType("application/json").content(content(input)));
    }
    String party(String tripId) throws Exception {
        return field(mvc.perform(auth(post("/api/v1/trips/" + tripId + "/parties"), a).header("Idempotency-Key", key()).contentType("application/json")
            .content(content(map("name", "Cafe team", "memberIds", List.of(a)))))
            .andExpect(status().isCreated()), "id");
    }
    int count(String table) { return db.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class); }
    long revision() { return db.queryForObject("SELECT settlement_revision FROM trip WHERE id=?", Long.class, trip); }
    String member(String userId) { return db.queryForObject("SELECT id FROM trip_member WHERE trip_id=? AND user_id=?", String.class, trip, userId); }

    @Test
    void sharedCrudKeepsZeroSharesUserIdsNotesAndDatesOutsideTravel() throws Exception {
        String party = party(trip);
        var input = body(2, map(a, 1, b, 1, c, 0)); input.put("partyId", party);
        String id = field(create(b, key(), input).andExpect(status().isCreated()).andExpect(jsonPath("$.data.settlementRevision").value("1")), "expense.id");
        mvc.perform(auth(get(expenses + "/" + id), c)).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.expense.payerId").value(a)).andExpect(jsonPath("$.data.expense.partyId").value(party))
            .andExpect(jsonPath("$.data.expense.date").value("2026-10-02")).andExpect(jsonPath("$.data.expense.note").value("메모 그대로 공유"))
            .andExpect(jsonPath("$.data.expense.shares['" + c + "']").value(0));
        assertEquals(3, count("expense_participant"));
        assertEquals(member(a), db.queryForObject("SELECT payer_trip_member_id FROM expense WHERE id=?", String.class, id));
        assertEquals(0, db.queryForObject("SELECT amount FROM expense_participant WHERE expense_id=? AND trip_member_id=?", Integer.class, id, member(c)));

        var changed = body(101, map(b, 60, c, 41)); changed.put("payerId", c);
        update(id, c, key(), "1", changed).andExpect(status().isOk()).andExpect(jsonPath("$.data.settlementRevision").value("2"))
            .andExpect(jsonPath("$.data.expense.amount").value(101)).andExpect(jsonPath("$.data.expense.partyId").isEmpty());
        assertEquals(2, count("expense_participant"));
        mvc.perform(auth(get(expenses), b)).andExpect(jsonPath("$.data.items[0].id").value(id)).andExpect(jsonPath("$.data.settlementRevision").value("2"));
        remove(id, b, key(), "2").andExpect(status().isOk()).andExpect(jsonPath("$.data.settlementRevision").value("3"));
        assertEquals(0, count("expense")); assertEquals(0, count("expense_participant"));
        mvc.perform(auth(get(expenses + "/" + id), a)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("EXPENSE_NOT_FOUND"));
        mvc.perform(auth(get(settlement), a)).andExpect(jsonPath("$.data.total").value(0)).andExpect(jsonPath("$.data.transfers.length()").value(0));
    }

    @Test
    void strictScalarAndShareValidationNeverPartiallyChangesAnExpense() throws Exception {
        String id = expense();
        var invalid = new ArrayList<Map<String, Object>>();
        for (var entry : map("title", " ", "amount", 0, "date", "2026-02-30", "note", "x".repeat(1001)).entrySet()) {
            var input = body(); input.put(entry.getKey(), entry.getValue()); invalid.add(input);
        }
        for (Object amount : List.of(-1, 1.5, "100", 1_000_000_001L)) {
            var input = body(); input.put("amount", amount); invalid.add(input);
        }
        var longTitle = body(); longTitle.put("title", "x".repeat(151)); invalid.add(longTitle);
        for (Map<String, Object> shares : List.of(map(), map(b, 99), map(b, -1, c, 101), map(b, 99.5, c, 0.5), map(b, "100"), map(outsider, 100))) {
            var input = body(); input.put("shares", shares); invalid.add(input);
        }
        var wrongPayer = body(); wrongPayer.put("payerId", outsider); invalid.add(wrongPayer);
        var forged = body(); forged.put("payer_trip_member_id", member(a)); invalid.add(forged);
        for (var input : invalid) {
            create(a, key(), input).andExpect(status().isBadRequest());
            update(id, b, key(), "1", input).andExpect(status().isBadRequest());
        }
        assertEquals(1, count("expense")); assertEquals(1, count("expense_participant")); assertEquals(1, revision());
        mvc.perform(auth(get(expenses + "/" + id), a)).andExpect(jsonPath("$.data.expense.amount").value(100));
        var boundary = body(1_000_000_000, map(b, 1_000_000_000)); boundary.put("title", "x".repeat(150)); boundary.put("note", "x".repeat(1000));
        create(a, key(), boundary).andExpect(status().isCreated());
    }

    @Test
    void outsidersForeignExpenseIdsAndForeignPartyReferencesAreRejected() throws Exception {
        String id = expense(), otherTrip = newTrip(), otherParty = party(otherTrip);
        for (String path : List.of(expenses, expenses + "/" + id, settlement)) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
            mvc.perform(auth(get(path), outsider)).andExpect(status().isNotFound());
        }
        create(outsider, key(), body()).andExpect(status().isNotFound());
        update(id, outsider, key(), "1", body()).andExpect(status().isNotFound());
        remove(id, outsider, key(), "1").andExpect(status().isNotFound());
        mvc.perform(auth(get("/api/v1/trips/" + otherTrip + "/expenses/" + id), a)).andExpect(status().isNotFound());
        mvc.perform(auth(delete("/api/v1/trips/" + otherTrip + "/expenses/" + id).param("settlementRevision", "0"), a).header("Idempotency-Key", key())).andExpect(status().isNotFound());
        var wrongParty = body(); wrongParty.put("partyId", otherParty);
        create(a, key(), wrongParty).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("PARTY_NOT_FOUND"));
        assertEquals(1, count("expense")); assertEquals(1, revision());
    }

    @Test
    void everyWriteRequiresARequestKeyAndStrictExpectedVersions() throws Exception {
        String id = expense();
        mvc.perform(auth(post(expenses), a).contentType("application/json").content(content(body()))).andExpect(status().isBadRequest());
        var updated = body(); updated.put("settlementRevision", "1");
        mvc.perform(auth(put(expenses + "/" + id), a).contentType("application/json").content(content(updated))).andExpect(status().isBadRequest());
        mvc.perform(auth(delete(expenses + "/" + id).param("settlementRevision", "1"), a)).andExpect(status().isBadRequest());
        mvc.perform(auth(delete(expenses + "/" + id), a).header("Idempotency-Key", key()))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mvc.perform(auth(put(settlement + "/confirmations"), b).contentType("application/json").content(content(completion(transfer(), "1", true, "0")))).andExpect(status().isBadRequest());
        for (String expected : List.of("garbage", "-1", "1.5")) {
            update(id, a, key(), expected, body()).andExpect(status().isBadRequest());
            remove(id, a, key(), expected).andExpect(status().isBadRequest());
        }
        update(id, a, key(), "0", body()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SETTLEMENT_CHANGED"));
        remove(id, b, key(), "0").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SETTLEMENT_CHANGED"));
        assertEquals(1, revision());
    }

    @Test
    void createUpdateDeleteRetriesReplayWithoutAdvancingTheRevisionAgain() throws Exception {
        String createKey = key(); var input = body(100, map(a, 0, b, 100));
        String id = field(create(a, createKey, input).andExpect(status().isCreated()), "expense.id");
        var reordered = body(100, map(b, 100, a, 0));
        create(a, createKey, reordered).andExpect(status().isCreated()).andExpect(jsonPath("$.data.expense.id").value(id)).andExpect(jsonPath("$.data.settlementRevision").value("1"));
        assertEquals(1, revision()); assertEquals(1, count("expense"));
        String updateKey = key(); var changed = body(200, map(b, 200));
        update(id, a, updateKey, "1", changed).andExpect(status().isOk()).andExpect(jsonPath("$.data.settlementRevision").value("2"));
        update(id, a, updateKey, "1", changed).andExpect(status().isOk()).andExpect(jsonPath("$.data.settlementRevision").value("2"));
        update(id, b, key(), "2", body()).andExpect(status().isOk());
        update(id, a, updateKey, "1", changed).andExpect(status().isOk()).andExpect(jsonPath("$.data.settlementRevision").value("2"));
        assertEquals(3, revision());
        String deleteKey = key();
        remove(id, a, deleteKey, "3").andExpect(status().isOk()).andExpect(jsonPath("$.data.settlementRevision").value("4"));
        remove(id, a, deleteKey, "3").andExpect(status().isOk()).andExpect(jsonPath("$.data.settlementRevision").value("4"));
        create(a, createKey, input).andExpect(status().isCreated()).andExpect(jsonPath("$.data.expense.id").value(id));
        assertEquals(4, revision()); assertEquals(0, count("expense"));
        create(a, createKey, body()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
        db.update("UPDATE trip SET status='ARCHIVED' WHERE id=?", trip);
        remove(id, a, deleteKey, "3").andExpect(status().isOk());
        create(a, createKey, input).andExpect(status().isCreated());
        db.update("DELETE FROM trip_member WHERE trip_id=? AND user_id=?", trip, a);
        create(a, createKey, input).andExpect(status().isNotFound());
    }

    @Test
    void settlementConservesAllBalancesAndAllowsAggregateTransfersAboveOneExpenseLimit() throws Exception {
        create(a, key(), body(1_000_000_000, map(b, 1_000_000_000))).andExpect(status().isCreated());
        create(a, key(), body(1_000_000_000, map(b, 1_000_000_000))).andExpect(status().isCreated());
        var response = mvc.perform(auth(get(settlement), c)).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
        Number total = field(response, "total"); assertEquals(2_000_000_000L, total.longValue());
        Map<String, Map<String, Number>> balances = field(response, "balances");
        List<Map<String, Object>> transfers = field(response, "transfers");
        var remaining = new LinkedHashMap<String, Long>();
        balances.forEach((person, balance) -> remaining.put(person, balance.get("balance").longValue()));
        for (var transfer : transfers) {
            long amount = ((Number) transfer.get("amount")).longValue();
            assertTrue(amount > 0);
            remaining.compute((String) transfer.get("from"), (person, value) -> value + amount);
            remaining.compute((String) transfer.get("to"), (person, value) -> value - amount);
        }
        assertTrue(remaining.values().stream().allMatch(amount -> amount == 0));
        assertEquals(2_000_000_000L, ((Number) transfers.getFirst().get("amount")).longValue());
        assertEquals("2:" + b + ":" + a + ":2000000000", transfers.getFirst().get("key"));
        confirm(a, key(), completion(transfers.getFirst(), "2", true, "0")).andExpect(status().isOk()).andExpect(jsonPath("$.data.completed").value(true));
    }

    @Test
    void onlyTransferRecipientsMayRecordOrCancelCompletionAndForgedRoutesAreRejected() throws Exception {
        var input = body(); input.put("payerId", b); input.put("shares", map(c, 100));
        create(a, key(), input).andExpect(status().isCreated());
        var transfer = transfer();
        assertEquals(c, transfer.get("from")); assertEquals(b, transfer.get("to"));
        for (String who : List.of(a, c))
            for (boolean completed : List.of(true, false))
                confirm(who, key(), completion(transfer, "1", completed, "0")).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("SETTLEMENT_RECEIVER_REQUIRED"));
        assertEquals(0, count("settlement_confirmation"));
        var incorrect = completion(transfer, "1", true, "0"); incorrect.put("amount", 99);
        confirm(b, key(), incorrect).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("TRANSFER_NOT_FOUND"));
        var forgedRecipient = completion(transfer, "1", true, "0"); forgedRecipient.put("toUserId", c);
        forgedRecipient.put("fromUserId", a);
        confirm(c, key(), forgedRecipient).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("TRANSFER_NOT_FOUND"));
        confirm(b, key(), completion(transfer, "1", true, "0")).andExpect(status().isOk());
        Object updatedAt = db.queryForObject("SELECT updated_at FROM settlement_confirmation", Object.class);
        for (String who : List.of(a, c))
            for (boolean completed : List.of(true, false))
                confirm(who, key(), completion(transfer, "1", completed, "1")).andExpect(status().isForbidden());
        assertEquals(updatedAt, db.queryForObject("SELECT updated_at FROM settlement_confirmation", Object.class));
        assertEquals(b, db.queryForObject("SELECT user_id FROM trip_member WHERE id=(SELECT updated_by_trip_member_id FROM settlement_confirmation)", String.class));
        confirm(b, key(), completion(transfer, "1", false, "1")).andExpect(status().isOk()).andExpect(jsonPath("$.data.completed").value(false));
        assertEquals(1, count("settlement_confirmation"));
    }

    @Test
    void legacySenderConfirmationRemainsReadableAndOnlyRecipientMayChangeIt() throws Exception {
        expense(); var transfer = transfer();
        db.update("INSERT INTO settlement_confirmation(trip_id,settlement_revision,from_trip_member_id,to_trip_member_id,amount,completed,version,updated_by_trip_member_id,updated_at) VALUES(?,1,?,?,100,TRUE,1,?,CURRENT_TIMESTAMP)", trip, member(b), member(a), member(b));
        for (String who : List.of(a, b, c))
            mvc.perform(auth(get(settlement), who)).andExpect(status().isOk()).andExpect(jsonPath("$.data.transfers[0].completed").value(true));
        confirm(b, key(), completion(transfer, "1", false, "1")).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("SETTLEMENT_RECEIVER_REQUIRED"));
        confirm(a, key(), completion(transfer, "1", false, "1")).andExpect(status().isOk()).andExpect(jsonPath("$.data.completed").value(false));
        assertEquals(member(a), db.queryForObject("SELECT updated_by_trip_member_id FROM settlement_confirmation", String.class));
    }

    @Test
    void completionVersionsNoOpsAndOldResponseReplayDoNotUndoALaterCancellation() throws Exception {
        expense(); var transfer = transfer();
        confirm(a, key(), completion(transfer, "1", false, "0")).andExpect(status().isOk()).andExpect(jsonPath("$.data.confirmationVersion").value("0"));
        assertEquals(0, count("settlement_confirmation"));
        String completedKey = key(); var completed = completion(transfer, "1", true, "0");
        confirm(a, completedKey, completed).andExpect(status().isOk()).andExpect(jsonPath("$.data.confirmationVersion").value("1"));
        Object updatedAt = db.queryForObject("SELECT updated_at FROM settlement_confirmation", Object.class);
        confirm(a, key(), completion(transfer, "1", true, "1")).andExpect(status().isOk()).andExpect(jsonPath("$.data.confirmationVersion").value("1"));
        assertEquals(updatedAt, db.queryForObject("SELECT updated_at FROM settlement_confirmation", Object.class));
        confirm(a, key(), completed).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONFIRMATION_CHANGED"));
        confirm(a, key(), completion(transfer, "1", false, "1")).andExpect(status().isOk()).andExpect(jsonPath("$.data.confirmationVersion").value("2"));
        confirm(a, completedKey, completed).andExpect(status().isOk()).andExpect(jsonPath("$.data.completed").value(true)).andExpect(jsonPath("$.data.confirmationVersion").value("1"));
        mvc.perform(auth(get(settlement), a)).andExpect(jsonPath("$.data.transfers[0].completed").value(false)).andExpect(jsonPath("$.data.transfers[0].confirmationVersion").value("2"));
        confirm(a, key(), completion(transfer, "1", true, "1")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONFIRMATION_CHANGED"));
        assertEquals(1, revision());
    }

    @Test
    void returningToTheSameExpenseAndSavingUnchangedDataNeverRevivesOldChecks() throws Exception {
        String id = expense(); var oldTransfer = transfer();
        String completedKey = key(); var oldRequest = completion(oldTransfer, "1", true, "0");
        confirm(a, completedKey, oldRequest).andExpect(status().isOk());
        update(id, a, key(), "1", body(200, map(b, 200))).andExpect(status().isOk());
        update(id, a, key(), "2", body()).andExpect(status().isOk());
        mvc.perform(auth(get(settlement), b)).andExpect(jsonPath("$.data.settlementRevision").value("3"))
            .andExpect(jsonPath("$.data.transfers[0].key").value("3:" + b + ":" + a + ":100"))
            .andExpect(jsonPath("$.data.transfers[0].completed").value(false)).andExpect(jsonPath("$.data.transfers[0].confirmationVersion").value("0"));
        confirm(a, key(), oldRequest).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SETTLEMENT_CHANGED"));
        confirm(a, completedKey, oldRequest).andExpect(status().isOk());
        assertEquals(Boolean.FALSE, transfer().get("completed"));
        var currentTransfer = transfer();
        confirm(a, key(), completion(currentTransfer, "3", true, "0")).andExpect(status().isOk());
        update(id, a, key(), "3", body()).andExpect(status().isOk()).andExpect(jsonPath("$.data.settlementRevision").value("4"));
        assertEquals(Boolean.FALSE, transfer().get("completed"));
        assertEquals(2, count("settlement_confirmation"));
        assertEquals(2, db.queryForObject("SELECT COUNT(*) FROM settlement_confirmation WHERE completed=1", Integer.class));
    }

    @Test
    void archivedTripsStillAllowCompletionButBlockExpenseMutations() throws Exception {
        String id = expense(); var transfer = transfer();
        db.update("UPDATE trip SET status='ARCHIVED' WHERE id=?", trip);
        for (String path : List.of(expenses, expenses + "/" + id, settlement)) mvc.perform(auth(get(path), b)).andExpect(status().isOk());
        create(a, key(), body()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TRIP_ARCHIVED"));
        update(id, a, key(), "1", body()).andExpect(status().isConflict());
        remove(id, a, key(), "1").andExpect(status().isConflict());
        confirm(a, key(), completion(transfer, "1", true, "0")).andExpect(status().isOk());
        confirm(a, key(), completion(transfer, "1", false, "1")).andExpect(status().isOk());
        assertEquals(1, revision()); assertEquals(1, count("expense"));
    }

    @Test
    void partyChangesKeepSavedSharesAndLinkedPartiesCannotBeDeleted() throws Exception {
        String party = party(trip); var input = body(2, map(a, 1, b, 1, c, 0)); input.put("partyId", party);
        String id = field(create(a, key(), input).andExpect(status().isCreated()), "expense.id");
        String path = "/api/v1/trips/" + trip + "/parties/" + party;
        mvc.perform(auth(delete(path), b)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PARTY_IN_USE"));
        mvc.perform(auth(put(path), b).contentType("application/json").content(content(map("name", "Changed", "memberIds", List.of(b)))))
            .andExpect(status().isOk());
        assertEquals(1, revision()); assertEquals(3, count("expense_participant"));
        mvc.perform(auth(get(expenses + "/" + id), c)).andExpect(jsonPath("$.data.expense.shares['" + c + "']").value(0));
        remove(id, a, key(), "1").andExpect(status().isOk());
        mvc.perform(auth(delete(path), b)).andExpect(status().isOk());
    }

    @Test
    void participantOnlyAndZeroShareAccountsCannotWithdrawEvenAfterArchival() throws Exception {
        create(a, key(), body(2, map(a, 1, b, 1, c, 0))).andExpect(status().isCreated());
        for (String who : List.of(b, c)) {
            mvc.perform(auth(delete("/api/v1/users/me"), who)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EXPENSE_MEMBER_REFERENCED"));
            assertTrue(users.existsById(Long.valueOf(who)));
        }
        db.update("UPDATE trip SET status='ARCHIVED' WHERE id=?", trip);
        mvc.perform(auth(delete("/api/v1/users/me"), c)).andExpect(status().isConflict());
        assertEquals(3, count("expense_participant")); assertEquals(1, revision());
    }

    @Test
    void pastConfirmationReferencesAlsoProtectAccountsAfterTheExpenseParticipantsChange() throws Exception {
        String id = expense();
        confirm(a, key(), completion(transfer(), "1", true, "0")).andExpect(status().isOk());
        update(id, a, key(), "1", body(100, map(c, 100))).andExpect(status().isOk());
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM expense_participant WHERE trip_member_id=?", Integer.class, member(b)));
        mvc.perform(auth(delete("/api/v1/users/me"), b)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EXPENSE_MEMBER_REFERENCED"));
        assertTrue(users.existsById(Long.valueOf(b))); assertEquals(1, count("settlement_confirmation"));
    }

    @Test
    void paginationCarriesRevisionAndRejectsAPageFromAnOlderExpenseSet() throws Exception {
        String first = expense(), second = expense();
        var page = mvc.perform(auth(get(expenses).param("limit", "1"), b)).andExpect(status().isOk());
        assertEquals(first, field(page, "items[0].id")); assertEquals("2", field(page, "settlementRevision"));
        String cursor = field(page, "nextCursor");
        mvc.perform(auth(get(expenses).param("limit", "1").param("cursor", cursor), c)).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.items[0].id").value(second)).andExpect(jsonPath("$.data.nextCursor").isEmpty());
        expense();
        mvc.perform(auth(get(expenses).param("limit", "1").param("cursor", cursor), b)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SETTLEMENT_CHANGED"));
        mvc.perform(auth(get(expenses).param("cursor", "invalid"), a)).andExpect(status().isBadRequest());
        for (String limit : List.of("0", "101")) mvc.perform(auth(get(expenses).param("limit", limit), a)).andExpect(status().isBadRequest());
    }

    @Test
    void failedParticipantWritesRollBackExpenseSharesRevisionAndIdempotencyResponse() throws Exception {
        String id = expense();
        confirm(a, key(), completion(transfer(), "1", true, "0")).andExpect(status().isOk());
        int remembered = count("api_idempotency");
        db.execute("ALTER TABLE expense_participant ADD CONSTRAINT expense_test_failpoint CHECK(amount <> 17)");
        String requestKey = key();
        boolean mysql = System.getenv("EXPENSE_MYSQL_URL") != null && !System.getenv("EXPENSE_MYSQL_URL").isBlank();
        // This injected CHECK is absent from production. MySQL reports HY000/3819 as
        // an uncategorized SQL failure (500), while H2 reports an integrity conflict (409).
        int failureStatus = mysql ? 500 : 409;
        try {
            create(a, key(), body(17, map(b, 17))).andExpect(status().is(failureStatus));
            update(id, a, requestKey, "1", body(17, map(b, 17))).andExpect(status().is(failureStatus));
            assertEquals(1, count("expense")); assertEquals(1, revision()); assertEquals(remembered, count("api_idempotency"));
            mvc.perform(auth(get(expenses + "/" + id), a)).andExpect(jsonPath("$.data.expense.amount").value(100)).andExpect(jsonPath("$.data.expense.shares['" + b + "']").value(100));
            assertEquals(Boolean.TRUE, transfer().get("completed"));
        } finally {
            db.execute("ALTER TABLE expense_participant DROP " + (mysql ? "CHECK" : "CONSTRAINT") + " expense_test_failpoint");
        }
        update(id, a, requestKey, "1", body(17, map(b, 17))).andExpect(status().isOk());
        assertEquals(2, revision()); assertEquals(Boolean.FALSE, transfer().get("completed"));
    }

    @Test
    void malformedLegacyFinancialDataIsReportedInsteadOfRoundedOrSilentlyRebalanced() throws Exception {
        String id = expense();
        db.update("UPDATE expense_participant SET amount=99 WHERE expense_id=?", id);
        mvc.perform(auth(get(settlement), a)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EXPENSE_DATA_INVALID"));
        db.update("UPDATE expense SET amount=100.50 WHERE id=?", id);
        db.update("UPDATE expense_participant SET amount=100.50 WHERE expense_id=?", id);
        mvc.perform(auth(get(settlement), a)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EXPENSE_DATA_INVALID"));
        assertEquals(1, revision());
    }

    @Test
    void revisionsRemainExactStringsAboveJavaScriptsSafeIntegerLimit() throws Exception {
        db.update("UPDATE trip SET settlement_revision=9007199254740993 WHERE id=?", trip);
        create(a, key(), body()).andExpect(status().isCreated()).andExpect(jsonPath("$.data.settlementRevision").value("9007199254740994"));
        mvc.perform(auth(get(settlement), b)).andExpect(jsonPath("$.data.settlementRevision").value("9007199254740994"))
            .andExpect(jsonPath("$.data.transfers[0].key").value("9007199254740994:" + b + ":" + a + ":100"));
        confirm(a, key(), completion(transfer(), "9007199254740994", true, "0")).andExpect(status().isOk());
    }

    @Test
    void exactCalculatorRejectsUnsafeAggregatesAndFractionalKrwWithoutRounding() {
        BigDecimal safe = BigDecimal.valueOf(ExpenseSettlementCalculator.MAX_SAFE_INTEGER);
        var huge = new ExpenseSettlementCalculator.Expense("payer", safe, Map.of("participant", safe));
        var overflow = assertThrows(ExpenseSettlementCalculator.InvalidDataException.class,
            () -> ExpenseSettlementCalculator.calculate("1", List.of("payer", "participant"), List.of(huge, huge)));
        assertTrue(overflow.unsafeAmount());
        var fraction = assertThrows(ExpenseSettlementCalculator.InvalidDataException.class,
            () -> ExpenseSettlementCalculator.wholeAmount(new BigDecimal("1.50")));
        assertFalse(fraction.unsafeAmount());
        assertEquals(2, ExpenseSettlementCalculator.wholeAmount(new BigDecimal("2.00")));
    }

    record Response(int status, String body) {}
    Response response(MockHttpServletRequestBuilder request) throws Exception {
        var result = mvc.perform(request).andReturn().getResponse();
        return new Response(result.getStatus(), result.getContentAsString());
    }
    List<Response> race(Callable<Response> first, Callable<Response> second) throws Exception {
        var ready = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var one = executor.submit(() -> { ready.await(); return first.call(); });
            var two = executor.submit(() -> { ready.await(); return second.call(); });
            return List.of(one.get(20, TimeUnit.SECONDS), two.get(20, TimeUnit.SECONDS));
        }
    }

    @Test
    void simultaneousDuplicateCreatesPersistOneExpenseAndOneRevision() throws Exception {
        String requestKey = key();
        var results = race(
            () -> response(auth(post(expenses), a).header("Idempotency-Key", requestKey).contentType("application/json").content(content(body()))),
            () -> response(auth(post(expenses), a).header("Idempotency-Key", requestKey).contentType("application/json").content(content(body()))));
        assertEquals(List.of(201, 201), results.stream().map(Response::status).toList(), results.toString());
        assertEquals(JsonPath.<String>read(results.getFirst().body(), "$.data.expense.id"), JsonPath.<String>read(results.getLast().body(), "$.data.expense.id"));
        assertEquals(1, count("expense")); assertEquals(1, revision());
    }

    @Test
    void simultaneousUpdatesWithOneExpectedRevisionCommitOnlyOneWholeExpense() throws Exception {
        String id = expense(); var first = body(200, map(b, 200)); var second = body(300, map(c, 300));
        first.put("settlementRevision", "1"); second.put("settlementRevision", "1");
        var results = race(
            () -> response(auth(put(expenses + "/" + id), a).header("Idempotency-Key", key()).contentType("application/json").content(content(first))),
            () -> response(auth(put(expenses + "/" + id), b).header("Idempotency-Key", key()).contentType("application/json").content(content(second))));
        assertEquals(List.of(200, 409), results.stream().map(Response::status).sorted().toList(), results.toString());
        assertEquals(2, revision()); assertEquals(1, count("expense_participant"));
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM expense e WHERE e.amount <> (SELECT SUM(p.amount) FROM expense_participant p WHERE p.expense_id=e.id)", Integer.class));
    }

    @Test
    void expenseModificationAndCompletionSerializeWithoutCheckingTheNewRevision() throws Exception {
        String id = expense(); var changed = body(200, map(b, 200)); changed.put("settlementRevision", "1");
        var completed = completion(transfer(), "1", true, "0");
        var results = race(
            () -> response(auth(put(expenses + "/" + id), a).header("Idempotency-Key", key()).contentType("application/json").content(content(changed))),
            () -> response(auth(put(settlement + "/confirmations"), a).header("Idempotency-Key", key()).contentType("application/json").content(content(completed))));
        assertEquals(200, results.getFirst().status(), results.toString());
        assertTrue(List.of(200, 409).contains(results.getLast().status()), results.toString());
        assertEquals(2, revision()); assertEquals(Boolean.FALSE, transfer().get("completed"));
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM settlement_confirmation WHERE settlement_revision=2", Integer.class));
    }

    @Test
    void withdrawalAndNewZeroShareExpenseSerializeWithoutLosingAParticipant() throws Exception {
        var input = body(100, map(b, 100, c, 0));
        var results = race(
            () -> response(auth(delete("/api/v1/users/me"), c)),
            () -> response(auth(post(expenses), b).header("Idempotency-Key", key()).contentType("application/json").content(content(input))));
        assertTrue((results.getFirst().status() == 200 && results.getLast().status() == 400)
            || (results.getFirst().status() == 409 && results.getLast().status() == 201), results.toString());
        assertEquals(results.getLast().status() == 201 ? 1 : 0, count("expense"));
        assertEquals(results.getLast().status() == 201 ? 2 : 0, count("expense_participant"));
        assertEquals(results.getLast().status() == 201, users.existsById(Long.valueOf(c)));
    }
}
