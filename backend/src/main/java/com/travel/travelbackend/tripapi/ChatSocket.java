package com.travel.travelbackend.tripapi;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.*;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.*;
import org.springframework.web.socket.*;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.web.socket.handler.*;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** Socket frames contain references only. HTTP reads reauthorize and supply the content. */
@Component
public class ChatSocket extends TextWebSocketHandler {
    private final ChatService chat;
    private final JwtDecoder decoder;
    private final ObjectMapper json;
    private final Map<String,Connection> connections=new ConcurrentHashMap<>();
    private static class Connection {
        final WebSocketSession session;
        final Instant opened=Instant.now();
        volatile Subscription subscription;
        Connection(WebSocketSession session) { this.session=new ConcurrentWebSocketSessionDecorator(session,5000,65536); }
    }
    private record Subscription(String token, String tripId, String partyId) {}
    public ChatSocket(ChatService chat, JwtDecoder decoder, ObjectMapper json) { this.chat=chat; this.decoder=decoder; this.json=json; }
    @Override public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        session.setTextMessageSizeLimit(16384);
        if(connections.size()>=1024) { session.close(CloseStatus.SERVICE_OVERLOAD); return; }
        connections.put(session.getId(),new Connection(session));
    }
    @Override protected void handleTextMessage(WebSocketSession session, TextMessage frame) {
        var connection=connections.get(session.getId());
        if(connection==null) return;
        try {
            if(connection.subscription!=null) throw new IllegalArgumentException("Already subscribed");
            var body=json.readValue(frame.getPayload(),Map.class);
            if(!"subscribe".equals(body.get("type")) || !(body.get("token") instanceof String token) || !(body.get("tripId") instanceof String tripId)) throw new IllegalArgumentException();
            String party=body.get("partyId")==null?null:(String)body.get("partyId");
            var subscription=new Subscription(token,tripId,party);
            authorize(subscription);
            connection.subscription=subscription;
            send(connection,Map.of("type","ready"));
        } catch(Exception e) { close(connection); }
    }
    private void authorize(Subscription subscription) {
        var jwt=decoder.decode(subscription.token());
        if(jwt.getExpiresAt()==null || !jwt.getExpiresAt().isAfter(Instant.now())) throw new IllegalArgumentException("Expired");
        chat.authorize(jwt,subscription.tripId(),subscription.partyId());
    }
    @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
    public void changed(ChatService.Changed change) {
        for(var connection:connections.values()) {
            var sub=connection.subscription;
            if(sub==null || !sub.tripId().equals(Long.toString(change.tripId())) || !Objects.equals(sub.partyId(),change.partyId()==null?null:change.partyId().toString())) continue;
            try {
                authorize(sub);
                send(connection,Map.of("type","changed","messageId",Long.toString(change.messageId())));
            } catch(Exception e) { close(connection); }
        }
    }
    @Scheduled(fixedDelay=10000)
    public void heartbeat() {
        for(var connection:connections.values()) {
            try {
                if(connection.subscription==null) {
                    if(connection.opened.plusSeconds(10).isBefore(Instant.now())) close(connection);
                } else {
                    authorize(connection.subscription);
                    send(connection,Map.of("type","heartbeat"));
                }
            } catch(Exception e) { close(connection); }
        }
    }
    private void send(Connection connection, Object body) throws Exception { connection.session.sendMessage(new TextMessage(json.writeValueAsString(body))); }
    private void close(Connection connection) {
        connections.remove(connection.session.getId());
        try { connection.session.close(CloseStatus.POLICY_VIOLATION); } catch(Exception ignored) {}
    }
    @Override public void afterConnectionClosed(WebSocketSession session, CloseStatus status) { connections.remove(session.getId()); }
    @Override public void handleTransportError(WebSocketSession session, Throwable exception) {
        var connection=connections.remove(session.getId()); if(connection!=null) close(connection);
    }
}

@Configuration
@EnableWebSocket
@EnableScheduling
class ChatSocketConfiguration implements WebSocketConfigurer {
    private final ChatSocket handler;
    private final String[] origins;
    ChatSocketConfiguration(ChatSocket handler, @Value("${users.allowed-origins:http://localhost:8081,http://localhost:8082}") String origins) {
        this.handler=handler; this.origins=Arrays.stream(origins.split(",")).map(String::trim).toArray(String[]::new);
    }
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler,"/ws/chat").setAllowedOrigins(origins);
    }
}
