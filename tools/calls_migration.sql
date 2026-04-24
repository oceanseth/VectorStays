-- VectorStays support-call infrastructure
-- Run once against the `vector` database on the production host.
-- Safe to re-run (uses IF NOT EXISTS / ALTER ... ADD COLUMN guards where MySQL supports them).

-- ---------------------------------------------------------------------------
-- 1. User changes: add `support` role + E.164 phone number for warm-transfer
-- ---------------------------------------------------------------------------
ALTER TABLE `User`
  MODIFY COLUMN `role` ENUM('admin','user','superadmin','support') DEFAULT NULL;

-- If the column already exists, skip the next line. MySQL < 8.0.29 doesn't
-- support IF NOT EXISTS on ADD COLUMN.
ALTER TABLE `User`
  ADD COLUMN `phone_e164` VARCHAR(20) DEFAULT NULL COMMENT 'E.164 number bland warm-transfers to';

-- ---------------------------------------------------------------------------
-- 2. Call: one row per inbound bland.ai call to +18056788907
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Call` (
  `_id`                   VARCHAR(64)  NOT NULL COMMENT 'bland call_id',
  `from_number`           VARCHAR(20)  DEFAULT NULL COMMENT 'caller E.164',
  `to_number`             VARCHAR(20)  DEFAULT NULL COMMENT 'our inbound DID',
  `guest_id`              VARCHAR(45)  DEFAULT NULL COMMENT 'matched Guest._id, nullable',
  `reservation_id`        VARCHAR(45)  DEFAULT NULL COMMENT 'matched Reservation._id, nullable',
  `listing_id`            VARCHAR(45)  DEFAULT NULL COMMENT 'matched Listing._id, nullable',
  `started_at`            DATETIME     DEFAULT NULL,
  `ended_at`              DATETIME     DEFAULT NULL,
  `status`                ENUM('in_progress','completed','transferred','failed') DEFAULT 'in_progress',
  `transferred_to_user_id` INT(10)     UNSIGNED DEFAULT NULL,
  `transcript_json`       LONGTEXT              COMMENT 'JSON array of transcript turns, updated live',
  `summary`               TEXT                  COMMENT 'bland.ai auto-summary, populated post-call',
  `recording_url`         VARCHAR(512) DEFAULT NULL,
  `created_at`            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`_id`),
  KEY `fromNumberIdx`   (`from_number`),
  KEY `guestIdx`        (`guest_id`),
  KEY `reservationIdx`  (`reservation_id`),
  KEY `statusIdx`       (`status`),
  KEY `startedAtIdx`    (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 3. TransferRequest: one row each time the AI agent asks for a human
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `TransferRequest` (
  `transfer_id`           INT(10)      UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`                  VARCHAR(16)  NOT NULL COMMENT 'short URL-safe identifier shared via Slack',
  `call_id`               VARCHAR(64)  NOT NULL COMMENT 'FK to Call._id',
  `reason`                TEXT                  COMMENT 'context the agent passes when requesting transfer',
  `requested_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at`            DATETIME     NOT NULL,
  `accepted_by_user_id`   INT(10)      UNSIGNED DEFAULT NULL,
  `accepted_at`           DATETIME     DEFAULT NULL,
  `status`                ENUM('pending','accepted','expired','failed','completed') DEFAULT 'pending',
  `slack_channel_id`      VARCHAR(32)  DEFAULT NULL,
  `slack_message_ts`      VARCHAR(32)  DEFAULT NULL COMMENT 'ts of the Slack post, for later update',
  PRIMARY KEY (`transfer_id`),
  UNIQUE KEY `codeUnique` (`code`),
  KEY `callIdx`           (`call_id`),
  KEY `statusIdx`         (`status`),
  KEY `expiresAtIdx`      (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

