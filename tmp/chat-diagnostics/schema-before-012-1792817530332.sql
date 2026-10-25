-- Before approved additive poll deadline migration
CREATE TABLE `chat_poll` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `message_id` bigint NOT NULL,
  `question` varchar(200) NOT NULL,
  `closed` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `message_id` (`message_id`),
  CONSTRAINT `chat_poll_ibfk_1` FOREIGN KEY (`message_id`) REFERENCES `chat_message` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
