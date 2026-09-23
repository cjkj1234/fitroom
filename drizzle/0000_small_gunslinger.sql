CREATE TABLE `seller_workspaces` (
	`user_id` text PRIMARY KEY NOT NULL,
	`products_json` text DEFAULT '[]' NOT NULL,
	`store_json` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
