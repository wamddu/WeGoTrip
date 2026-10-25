package com.travel.travelbackend.notifications;

import java.util.Map;

public interface PushSender {
    record Message(String token, String title, String body, Map<String,String> data, long ttlMillis) {}
    enum Status { ACCEPTED, INVALID_TOKEN, RETRY, FAILED }
    record Result(Status status, String code, int retryAfterSeconds) {
        public static Result accepted() { return new Result(Status.ACCEPTED,"OK",0); }
    }
    boolean available();
    Result send(Message message);
}
