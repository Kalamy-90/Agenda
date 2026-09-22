import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const multiplayerRooms = mysqlTable("multiplayer_rooms", {
  inviteCode: varchar("inviteCode", { length: 16 }).primaryKey(),
  hostKey: varchar("hostKey", { length: 128 }).notNull(),
  nickname: varchar("nickname", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});

export const multiplayerSignals = mysqlTable("multiplayer_signals", {
  id: int("id").autoincrement().primaryKey(),
  inviteCode: varchar("inviteCode", { length: 16 }).notNull(),
  session: varchar("session", { length: 32 }).notNull(),
  recipient: varchar("recipient", { length: 8 }).notNull(),
  payload: text("payload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MultiplayerRoom = typeof multiplayerRooms.$inferSelect;
export type MultiplayerSignal = typeof multiplayerSignals.$inferSelect;
