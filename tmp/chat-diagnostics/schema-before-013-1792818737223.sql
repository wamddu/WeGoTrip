-- Before approved multiple-choice poll migration
CREATE TABLE `chat_poll` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `message_id` bigint NOT NULL,
  `question` varchar(200) NOT NULL,
  `closed` tinyint(1) NOT NULL DEFAULT '0',
  `closes_at` timestamp(6) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `message_id` (`message_id`),
  KEY `idx_chat_poll_deadline` (`closed`,`closes_at`),
  CONSTRAINT `chat_poll_ibfk_1` FOREIGN KEY (`message_id`) REFERENCES `chat_message` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `chat_poll_vote` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `poll_id` bigint NOT NULL,
  `option_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `poll_id` (`poll_id`,`user_id`),
  KEY `option_id` (`option_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `chat_poll_vote_ibfk_1` FOREIGN KEY (`poll_id`) REFERENCES `chat_poll` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_poll_vote_ibfk_2` FOREIGN KEY (`option_id`) REFERENCES `chat_poll_option` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_poll_vote_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

