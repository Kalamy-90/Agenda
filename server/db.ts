import { and, asc, eq, gt, inArray, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  multiplayerRooms,
  multiplayerSignals,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];

  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };

  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createMultiplayerRoom(input: {
  inviteCode: string;
  hostKey: string;
  nickname: string | null;
  createdAt: Date;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(multiplayerRooms).values(input);
  return true;
}

export async function getMultiplayerRoom(inviteCode: string, now = new Date()) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(multiplayerRooms)
    .where(and(eq(multiplayerRooms.inviteCode, inviteCode), gt(multiplayerRooms.expiresAt, now)))
    .limit(1);
  return result[0];
}

export async function deleteMultiplayerRoom(inviteCode: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(multiplayerSignals).where(eq(multiplayerSignals.inviteCode, inviteCode));
  await db.delete(multiplayerRooms).where(eq(multiplayerRooms.inviteCode, inviteCode));
}

export async function enqueueMultiplayerSignal(input: {
  inviteCode: string;
  session: string;
  recipient: "host" | "join";
  payload: string;
}) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(multiplayerSignals).values(input);
  return true;
}

export async function takeMultiplayerSignals(input: {
  inviteCode: string;
  session?: string;
  recipient: "host" | "join";
}) {
  const db = await getDb();
  if (!db) return [];

  return db.transaction(async tx => {
    const filters = [
      eq(multiplayerSignals.inviteCode, input.inviteCode),
      eq(multiplayerSignals.recipient, input.recipient),
      ...(input.session ? [eq(multiplayerSignals.session, input.session)] : []),
    ];
    const rows = await tx
      .select()
      .from(multiplayerSignals)
      .where(and(...filters))
      .orderBy(asc(multiplayerSignals.id));

    if (rows.length > 0) {
      await tx.delete(multiplayerSignals).where(
        inArray(multiplayerSignals.id, rows.map(row => row.id)),
      );
    }
    return rows;
  });
}

export async function pruneMultiplayerState(now = new Date()) {
  const db = await getDb();
  if (!db) return;
  const expired = await db
    .select({ inviteCode: multiplayerRooms.inviteCode })
    .from(multiplayerRooms)
    .where(lt(multiplayerRooms.expiresAt, now));
  if (expired.length === 0) return;
  await db.delete(multiplayerSignals).where(
    inArray(multiplayerSignals.inviteCode, expired.map(row => row.inviteCode)),
  );
  await db.delete(multiplayerRooms).where(
    inArray(multiplayerRooms.inviteCode, expired.map(row => row.inviteCode)),
  );
}
