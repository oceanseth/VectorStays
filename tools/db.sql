CREATE TABLE `APILog` (
  `_id` int(11) NOT NULL AUTO_INCREMENT,
  `method` varchar(45) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `REQUEST` mediumtext,
  `RESPONSE` mediumtext,
  `timestamp` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`_id`),
  UNIQUE KEY `_id_UNIQUE` (`_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
CREATE TABLE `Guest` (
  `_id` varchar(45) NOT NULL,
  `firstName` varchar(45) DEFAULT NULL,
  `lastName` varchar(45) DEFAULT NULL,
  `phone` varchar(45) DEFAULT NULL,
  `email` varchar(145) DEFAULT NULL,
  `airbnb_url` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
CREATE TABLE `HookHistory` (
  `HookHistoryId` int(10) NOT NULL AUTO_INCREMENT,
  `_id` int(10) unsigned NOT NULL,
  `datetime` datetime NOT NULL,
  `body` longtext,
  PRIMARY KEY (`HookHistoryId`)
) ENGINE=InnoDB AUTO_INCREMENT=4476 DEFAULT CHARSET=utf8;
CREATE TABLE `Integration` (
  `_id` int(11) NOT NULL AUTO_INCREMENT,
  `type` enum('airbnb','homeaway','guesty') DEFAULT NULL,
  `username` varchar(255) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `token` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8;
CREATE TABLE `Listing` (
  `_id` varchar(45) NOT NULL,
  `accountId` varchar(45) DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `airbnb_id` int(10) unsigned DEFAULT NULL,
  `airbnbDownAt` date DEFAULT NULL,
  `rentalsUnited_id` int(11) DEFAULT NULL,
  `homeaway_id` int(11) DEFAULT NULL,
  `nickname` varchar(75) DEFAULT NULL,
  `tags` varchar(45) DEFAULT NULL,
  `isListed` tinyint(4) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `propertyType` varchar(45) DEFAULT NULL,
  `roomType` varchar(45) DEFAULT NULL,
  `accommodates` int(10) unsigned DEFAULT NULL,
  `bedrooms` int(10) unsigned DEFAULT NULL,
  `bathrooms` int(10) unsigned DEFAULT '1',
  `areaSquareFeet` int(10) unsigned DEFAULT NULL,
  `defaultCheckInTime` varchar(45) DEFAULT NULL,
  `defaultCheckOutTime` varchar(45) DEFAULT NULL,
  `active` tinyint(4) DEFAULT NULL,
  `address_full` varchar(255) DEFAULT NULL,
  `address_city` varchar(45) DEFAULT NULL,
  `address_state` varchar(45) DEFAULT NULL,
  `address_country` varchar(45) DEFAULT NULL,
  `address_zipcode` varchar(45) DEFAULT NULL,
  `address_neighborhood` varchar(45) DEFAULT NULL,
  `address_street` varchar(45) DEFAULT NULL,
  `address_apt` varchar(45) DEFAULT NULL,
  `address_lat` float DEFAULT NULL,
  `address_lng` float DEFAULT NULL,
  `address_floor` int(10) unsigned DEFAULT NULL,
  `address_searchable` varchar(255) DEFAULT NULL,
  `basePrice` float unsigned DEFAULT NULL,
  `securityDepositFee` float unsigned DEFAULT NULL,
  `cleaningFee` float unsigned DEFAULT NULL,
  `leaseCost` float NOT NULL DEFAULT '0',
  `furnitureCost` float NOT NULL DEFAULT '0',
  `utilitiesCost` float NOT NULL DEFAULT '0',
  `leaseStartDate` date DEFAULT NULL,
  `leaseType` int(10) DEFAULT '0',
  `lastActiveDate` date DEFAULT NULL,
  `fixedManagementFee` float DEFAULT '0',
  `percentManagementFee` float DEFAULT '0',
  `picture` varchar(255) DEFAULT NULL,
  `publicdescription_summary` longtext,
  `publicdescription_rules` longtext,
  `publicdescription_notes` longtext,
  PRIMARY KEY (`_id`),
  UNIQUE KEY `_id_UNIQUE` (`_id`),
  KEY `nicknameindex` (`nickname`),
  KEY `cityindex` (`address_city`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
CREATE TABLE `ListingCalendar` (
  `_id` varchar(45) NOT NULL,
  `listingId` varchar(45) NOT NULL,
  `date` date NOT NULL,
  `status` enum('available','booked','reserved','unavailable') DEFAULT NULL,
  `note` varchar(45) DEFAULT NULL,
  `price` float DEFAULT NULL,
  `currency` char(3) DEFAULT NULL,
  `reservationId` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`_id`),
  UNIQUE KEY `_id_UNIQUE` (`_id`),
  KEY `listingindex` (`listingId`),
  KEY `dateindex` (`date`),
  KEY `reservationindex` (`reservationId`),
  KEY `datestatus` (`status`,`date`,`listingId`),
  KEY `listingId` (`listingId`),
  KEY `statusindex` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
CREATE TABLE `Reservation` (
  `_id` varchar(45) NOT NULL,
  `accountId` varchar(45) DEFAULT NULL,
  `listingId` varchar(45) DEFAULT NULL,
  `createdAt` datetime DEFAULT NULL,
  `lastUpdatedAt` datetime DEFAULT NULL,
  `confirmedAt` datetime DEFAULT NULL,
  `confirmationCode` varchar(255) DEFAULT NULL,
  `canceledAt` datetime DEFAULT NULL,
  `canceledBy` varchar(255) DEFAULT NULL,
  `guestsCount` int(10) unsigned DEFAULT NULL,
  `status` varchar(45) DEFAULT NULL,
  `fareAccommodation` float DEFAULT NULL,
  `fareCleaning` float DEFAULT NULL,
  `hostPayout` float DEFAULT NULL,
  `compadr` float DEFAULT NULL,
  `currency` varchar(45) DEFAULT NULL,
  `checkIn` date DEFAULT NULL,
  `checkOut` date DEFAULT NULL,
  `guestId` varchar(45) DEFAULT NULL,
  `source` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`_id`),
  KEY `listingIdIndex` (`listingId`),
  KEY `statusindex` (`status`),
  KEY `checkInIndex` (`checkIn`),
  KEY `checkOutIndex` (`checkOut`),
  KEY `guestIndex` (`guestId`),
  KEY `createdAtIndex` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
CREATE TABLE `User` (
  `user_id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(45) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `fullname` varchar(45) DEFAULT NULL,
  `commission` float DEFAULT NULL,
  `role` enum('admin','user','superadmin','support') DEFAULT NULL,
  `token` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone_e164` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `id_UNIQUE` (`user_id`),
  UNIQUE KEY `username_UNIQUE` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8;
CREATE TABLE `User_Listing` (
  `user_id` int(11) NOT NULL,
  `_id` varchar(45) NOT NULL,
   `tagsLocal` VARCHAR(255),
  UNIQUE KEY `pk` (`user_id`,`_id`),
  KEY `user_id_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `monthlyCachedAnalytics` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `month` varchar(7) CHARACTER SET utf8 DEFAULT NULL,
  `revenue` double DEFAULT NULL,
  `listingId` varchar(45) CHARACTER SET utf8 NOT NULL,
  `revsource` varchar(45) CHARACTER SET utf8 DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `monthListingSourceUnique` (`month`,`listingId`,`revsource`),
  KEY `revestment_listing_id_fk` (`listingId`),
  CONSTRAINT `revestment_listing_id_fk` FOREIGN KEY (`listingId`) REFERENCES `Listing` (`_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `monthlyCachedRevPar` (
  `_id` int(11) NOT NULL AUTO_INCREMENT,
  `month` varchar(7) CHARACTER SET utf8 NOT NULL,
  `listingId` varchar(45) CHARACTER SET utf8 NOT NULL,
  `adr` float NOT NULL,
  `occ` float NOT NULL,
  `revpar` float NOT NULL,
  PRIMARY KEY (`_id`),
  UNIQUE KEY `revpar_month_listingId_UNIQUE`( `month`, `listingId`),
  CONSTRAINT `revpar_listing_fk` FOREIGN KEY (`listingId`) REFERENCES `Listing` (`_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `Review` (
  `_id` int(11) NOT NULL AUTO_INCREMENT,
  `listingId` varchar(45) CHARACTER SET utf8 NOT NULL,
  `totalReviews` int(11) NOT NULL,
  `fiveStarsRatio` float NOT NULL,
  `overall` float NOT NULL,
  `accuracy` float NOT NULL,
  `cleanliness` float NOT NULL,
  `communication` float NOT NULL,
  `checkIn` float NOT NULL,
  `location` float NOT NULL,
  `value` float NOT NULL,
  `createdAt` datetime NOT NULL,
  PRIMARY KEY (`_id`),
  CONSTRAINT `review_listing_fk` FOREIGN KEY (`listingId`) REFERENCES `Listing` (`_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE `Reservation_Review` (
  `_id` int(11) NOT NULL AUTO_INCREMENT,
  `reservationId` varchar(45) CHARACTER SET utf8 NOT NULL,
  `overall` float NOT NULL,
  `accuracy` float NOT NULL,
  `cleanliness` float NOT NULL,
  `communication` float NOT NULL,
  `checkIn` float NOT NULL,
  `location` float NOT NULL,
  `value` float NOT NULL,
  `feedbackPublic` text,
  `feedbackPrivate` text,
  `feedbackAccuracy` text,
  `feedbackCleanliness` text,
  `feedbackCommunication` text,
  `feedbackCheckIn` text,
  `feedbackLocation` text,
  `feedbackValue` text,
  `createdAt` datetime NOT NULL,
  PRIMARY KEY (`_id`),
  CONSTRAINT `reservation_review_reservation_fk` FOREIGN KEY (`reservationId`) REFERENCES `Reservation` (`_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE `monthlyCachedOccupancy` (
  `month` char(7) NOT NULL,
  `listingId` varchar(45) NOT NULL,
  `daysBooked` int(11) DEFAULT NULL,
  `occ` float DEFAULT NULL,
  UNIQUE KEY `monthListingUnique` (`month`,`listingId`),
  KEY `monthIndex` (`month`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE `Call` (
  `_id` varchar(64) NOT NULL COMMENT 'bland call_id',
  `from_number` varchar(20) DEFAULT NULL,
  `to_number` varchar(20) DEFAULT NULL,
  `guest_id` varchar(45) DEFAULT NULL,
  `reservation_id` varchar(45) DEFAULT NULL,
  `listing_id` varchar(45) DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `ended_at` datetime DEFAULT NULL,
  `status` enum('in_progress','completed','transferred','failed') DEFAULT 'in_progress',
  `transferred_to_user_id` int(10) unsigned DEFAULT NULL,
  `transcript_json` longtext,
  `summary` text,
  `recording_url` varchar(512) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`_id`),
  KEY `fromNumberIdx` (`from_number`),
  KEY `guestIdx` (`guest_id`),
  KEY `reservationIdx` (`reservation_id`),
  KEY `statusIdx` (`status`),
  KEY `startedAtIdx` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `TransferRequest` (
  `transfer_id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(16) NOT NULL,
  `call_id` varchar(64) NOT NULL,
  `reason` text,
  `requested_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime NOT NULL,
  `accepted_by_user_id` int(10) unsigned DEFAULT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `status` enum('pending','accepted','expired','failed','completed') DEFAULT 'pending',
  `slack_channel_id` varchar(32) DEFAULT NULL,
  `slack_message_ts` varchar(32) DEFAULT NULL,
  PRIMARY KEY (`transfer_id`),
  UNIQUE KEY `codeUnique` (`code`),
  KEY `callIdx` (`call_id`),
  KEY `statusIdx` (`status`),
  KEY `expiresAtIdx` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
