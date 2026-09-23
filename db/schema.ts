import { sql } from "drizzle-orm";
import { text } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "drizzle-orm/sqlite-core";

export const sellerWorkspaces = sqliteTable("seller_workspaces", {
  userId: text("user_id").primaryKey(),
  productsJson: text("products_json").notNull().default("[]"),
  storeJson: text("store_json"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
