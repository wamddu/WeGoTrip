package com.travel.travelbackend.notifications;

import com.google.api.client.json.gson.GsonFactory;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class FcmPushSenderTests {
    private JsonObject request(Map<String,String> data) throws Exception {
        var message=new PushSender.Message("test-token","테스트 여행 · 전체 채팅","민수: 곧 도착해요",data,60000);
        return JsonParser.parseString(GsonFactory.getDefaultInstance().toString(FcmPushSender.request(message))).getAsJsonObject();
    }
    private Map<String,String> chat(String recipient,String trip,String party,String delivery) {
        return Map.of("type","CHAT_MESSAGE","recipientId",recipient,"tripId",trip,"partyId",party,
            "messageId",delivery,"eventId",delivery,"deliveryId",delivery);
    }
    private String tag(JsonObject request) {
        return request.getAsJsonObject("android").getAsJsonObject("notification").get("tag").getAsString();
    }
    @Test void foregroundAndBackgroundUseTheSameRoomIdentityAndCarryPreview() throws Exception {
        var request=request(chat("1","2","","3"));
        assertEquals("chat-1-2-all",tag(request));
        assertEquals(tag(request),request.getAsJsonObject("webpush").getAsJsonObject("notification").get("tag").getAsString());
        assertEquals(tag(request),request.getAsJsonObject("apns").getAsJsonObject("payload").getAsJsonObject("aps").get("thread-id").getAsString());
        assertEquals("테스트 여행 · 전체 채팅",request.getAsJsonObject("notification").get("title").getAsString());
        assertEquals("민수: 곧 도착해요",request.getAsJsonObject("notification").get("body").getAsString());
        assertEquals("default",request.getAsJsonObject("android").getAsJsonObject("notification").get("channel_id").getAsString());
    }
    @Test void newMessagesReplaceOnlyTheSameRoomAndRecipient() throws Exception {
        assertEquals(tag(request(chat("1","2","","3"))),tag(request(chat("1","2","","4"))));
        var tags=new HashSet<String>();
        for(var data:List.of(chat("1","2","","3"),chat("1","2","5","4"),chat("1","2","6","5"),
            chat("1","3","","6"),chat("2","2","","7"))) assertTrue(tags.add(tag(request(data))));
    }
    @Test void noticesRemainSeparateFromChatRooms() throws Exception {
        var notice=request(Map.of("type","TRIP_NOTICE","recipientId","1","tripId","2","noticeId","3"));
        assertEquals("notice-1-3",tag(notice));
        assertNotEquals(tag(request(chat("1","2","3","4"))),tag(notice));
    }
}
