-- Before user-approved push outbox creation
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

CREATE TABLE `user_device` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `fcm_token` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  `device_type` varchar(10) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_active_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `refresh_token` char(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_device_fcm_token` (`fcm_token`),
  KEY `fk_user_device_user` (`user_id`),
  CONSTRAINT `fk_user_device_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `user_setting` (
  `user_id` bigint NOT NULL,
  `push_notification_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `location_sharing_enabled` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_user_setting_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

