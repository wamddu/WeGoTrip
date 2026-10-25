-- Before user-approved trip_notice creation
CREATE TABLE `user` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) DEFAULT NULL,
  `name` varchar(50) NOT NULL,
  `role` varchar(20) NOT NULL DEFAULT 'USER',
  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
  `login_provider` varchar(20) NOT NULL DEFAULT 'LOCAL',
  `provider_id` varchar(255) DEFAULT NULL,
  `bank_account_number` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `bank_account_encrypted` varchar(512) DEFAULT NULL,
  `token_version` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `trip` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `destination` varchar(100) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `invite_code` varchar(30) DEFAULT NULL,
  `owner_id` bigint DEFAULT NULL,
  `budget` bigint NOT NULL DEFAULT '0',
  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
  `max_members` int NOT NULL DEFAULT '30',
  `version` bigint NOT NULL DEFAULT '0',
  `created_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `settlement_revision` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_trip_invite_code` (`invite_code`),
  KEY `fk_trip_owner` (`owner_id`),
  KEY `idx_trip_created` (`created_at`,`id`),
  CONSTRAINT `fk_trip_owner` FOREIGN KEY (`owner_id`) REFERENCES `user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `chat_message` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `trip_id` bigint NOT NULL,
  `sender_id` bigint DEFAULT NULL,
  `reply_to_message_id` bigint DEFAULT NULL,
  `content` text,
  `message_type` varchar(20) NOT NULL DEFAULT 'NORMAL',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `party_id` bigint DEFAULT NULL,
  `author_id` bigint DEFAULT NULL,
  `kind` varchar(10) NOT NULL DEFAULT 'TEXT',
  `text` varchar(2000) NOT NULL DEFAULT '',
  `image_upload_id` bigint DEFAULT NULL,
  `revision` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chat_realtime_image` (`image_upload_id`),
  KEY `fk_chat_sender` (`sender_id`),
  KEY `fk_chat_reply` (`reply_to_message_id`),
  KEY `fk_chat_realtime_party` (`party_id`),
  KEY `fk_chat_realtime_author` (`author_id`),
  KEY `idx_chat_history` (`trip_id`,`party_id`,`id`),
  CONSTRAINT `fk_chat_realtime_author` FOREIGN KEY (`author_id`) REFERENCES `user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_chat_realtime_image` FOREIGN KEY (`image_upload_id`) REFERENCES `chat_image_upload` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_chat_realtime_party` FOREIGN KEY (`party_id`) REFERENCES `trip_party` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_reply` FOREIGN KEY (`reply_to_message_id`) REFERENCES `chat_message` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_chat_sender` FOREIGN KEY (`sender_id`) REFERENCES `user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_chat_trip` FOREIGN KEY (`trip_id`) REFERENCES `trip` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `notification` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `title` varchar(150) NOT NULL,
  `content` text NOT NULL,
  `type` varchar(50) NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `fk_notification_user` (`user_id`),
  CONSTRAINT `fk_notification_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `push_event` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `event_type` varchar(40) NOT NULL,
  `source_id` bigint NOT NULL,
  `actor_id` bigint DEFAULT NULL,
  `trip_id` bigint DEFAULT NULL,
  `party_id` bigint DEFAULT NULL,
  `targets_json` mediumtext NOT NULL,
  `expanded_at` timestamp(6) NULL DEFAULT NULL,
  `created_at` timestamp(6) NOT NULL,
  `expires_at` timestamp(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_push_event_source` (`event_type`,`source_id`),
  KEY `actor_id` (`actor_id`),
  KEY `trip_id` (`trip_id`),
  KEY `party_id` (`party_id`),
  KEY `idx_push_event_expand` (`expanded_at`,`created_at`,`id`),
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

-- Counts before: {user=19, trip=7, chat_message=10, notification=0, push_event=0, push_delivery=0}
