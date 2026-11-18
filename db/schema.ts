import { sql } from "drizzle-orm";
import { index, primaryKey, text } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "drizzle-orm/sqlite-core";

export const sellerWorkspaces = sqliteTable("seller_workspaces", {
  userId: text("user_id").primaryKey(),
  productsJson: text("products_json").notNull().default("[]"),
  storeJson: text("store_json"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// 판매자 상품 사진(앞·뒤 평면 사진). image: 옷 둘레로 자른 JPEG data URL, mask: 옷 마스크 PNG data URL.
// 상품 정보(products_json)와 따로 두어 상품 정보 동기화가 가볍게 유지된다. version은 상품의 photo.version과 같다.
export const productPhotos = sqliteTable(
  "product_photos",
  {
    userId: text("user_id").notNull(),
    productId: text("product_id").notNull(),
    side: text("side", { enum: ["front", "back"] }).notNull(),
    version: text("version").notNull(),
    image: text("image").notNull(),
    mask: text("mask").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.productId, table.side] }),
    // 이용자 화면은 상품 id와 면(앞·뒤)으로 사진을 찾는다.
    index("product_photos_product_side_idx").on(table.productId, table.side),
  ],
);
