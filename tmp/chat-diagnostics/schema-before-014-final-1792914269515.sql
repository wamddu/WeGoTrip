-- Before finalizing the two user-approved outbox tables
CREATE TABLE `push_event` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `event_type` varchar(40) NOT NULL,
  `source_id` bigint NOT NULL,
  `actor_id` bigint DEFAULT NULL,
  `trip_id` bigint DEFAULT NULL,
  `party_id` bigint DEFAULT NULL,
  `created_at` timestamp(6) NOT NULL,
  `expires_at` timestamp(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_push_event_source` (`event_type`,`source_id`),
  KEY `actor_id` (`actor_id`),
  KEY `trip_id` (`trip_id`),
  KEY `party_id` (`party_id`),
  CONSTRAINT `push_event_ibfk_1` FOREIGN KEY (`actor_id`) REFERENCES `user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `push_event_ibfk_2` FOREIGN KEY (`trip_id`) REFERENCES `trip` (`id`) ON DELETE CASCADE,
  CONSTRAINT `push_event_ibfk_3` FOREIGN KEY (`party_id`) REFERENCES `trip_party` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `push_delivery` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `event_id` bigint NOT NULL,
  `recipient_id` bigint NOT NULL,
  `device_id` bigint NOT NULL,
  `token_hash` char(64) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'PENDING',
  `attempts` int NOT NULL DEFAULT '0',
  `next_attempt_at` timestamp(6) NOT NULL,
  `lease_until` timestamp(6) NULL DEFAULT NULL,
  `lease_token` varchar(36) DEFAULT NULL,
  `last_error_code` varchar(80) DEFAULT NULL,
  `sent_at` timestamp(6) NULL DEFAULT NULL,
  `created_at` timestamp(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_push_delivery_device` (`event_id`,`device_id`),
  KEY `idx_push_delivery_due` (`status`,`next_attempt_at`,`id`),
  KEY `idx_push_delivery_lease` (`status`,`lease_until`,`id`),
  KEY `recipient_id` (`recipient_id`),
  KEY `device_id` (`device_id`),
  CONSTRAINT `push_delivery_ibfk_1` FOREIGN KEY (`event_id`) REFERENCES `push_event` (`id`) ON DELETE CASCADE,
  CONSTRAINT `push_delivery_ibfk_2` FOREIGN KEY (`recipient_id`) REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `push_delivery_ibfk_3` FOREIGN KEY (`device_id`) REFERENCES `user_device` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

