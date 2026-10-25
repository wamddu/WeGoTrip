-- Schema before additive chat repair. chat_message count: 0
CREATE TABLE `chat_message` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `trip_id` bigint NOT NULL,
  `sender_id` bigint DEFAULT NULL,
  `reply_to_message_id` bigint DEFAULT NULL,
  `content` text,
  `message_type` varchar(20) NOT NULL DEFAULT 'NORMAL',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_chat_trip` (`trip_id`),
  KEY `fk_chat_sender` (`sender_id`),
  KEY `fk_chat_reply` (`reply_to_message_id`),
  CONSTRAINT `fk_chat_reply` FOREIGN KEY (`reply_to_message_id`) REFERENCES `chat_message` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_chat_sender` FOREIGN KEY (`sender_id`) REFERENCES `user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_chat_trip` FOREIGN KEY (`trip_id`) REFERENCES `trip` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `chat_attachment` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `message_id` bigint NOT NULL,
  `storage_key` varchar(500) NOT NULL,
  `original_file_name` varchar(255) NOT NULL,
  `mime_type` varchar(100) NOT NULL,
  `file_size` bigint NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_attachment_message` (`message_id`),
  CONSTRAINT `fk_attachment_message` FOREIGN KEY (`message_id`) REFERENCES `chat_message` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `chat_image_upload` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `trip_id` bigint NOT NULL,
  `party_id` bigint DEFAULT NULL,
  `author_id` bigint DEFAULT NULL,
  `public_id` varchar(255) NOT NULL,
  `image_url` varchar(1000) NOT NULL,
  `claimed` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  KEY `trip_id` (`trip_id`),
  KEY `party_id` (`party_id`),
  KEY `author_id` (`author_id`),
  CONSTRAINT `chat_image_upload_ibfk_1` FOREIGN KEY (`trip_id`) REFERENCES `trip` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_image_upload_ibfk_2` FOREIGN KEY (`party_id`) REFERENCES `trip_party` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_image_upload_ibfk_3` FOREIGN KEY (`author_id`) REFERENCES `user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

