CREATE TABLE `multiplayer_rooms` (
	`inviteCode` varchar(16) NOT NULL,
	`hostKey` varchar(128) NOT NULL,
	`nickname` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `multiplayer_rooms_inviteCode` PRIMARY KEY(`inviteCode`)
);
--> statement-breakpoint
CREATE TABLE `multiplayer_signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inviteCode` varchar(16) NOT NULL,
	`session` varchar(32) NOT NULL,
	`recipient` varchar(8) NOT NULL,
	`payload` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `multiplayer_signals_id` PRIMARY KEY(`id`)
);
