CREATE TABLE `product_photos` (
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`side` text NOT NULL,
	`version` text NOT NULL,
	`image` text NOT NULL,
	`mask` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `product_id`, `side`)
);
--> statement-breakpoint
CREATE INDEX `product_photos_product_side_idx` ON `product_photos` (`product_id`,`side`);