package com.travel.travelbackend.notifications;

import java.util.Optional;

/** One policy per source type; future notices reuse the queue, worker and sender. */
public interface PushPolicy {
    String type();
    Optional<PushSender.Message> resolve(long deliveryId, String leaseToken);
}
