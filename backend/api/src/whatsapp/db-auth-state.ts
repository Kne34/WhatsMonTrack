import { AuthenticationCreds, AuthenticationState, BufferJSON, initAuthCreds, proto, SignalDataSet, SignalDataTypeMap } from '@whiskeysockets/baileys';

/** The subset of Prisma used here, so the store can be unit-tested with a fake. */
export interface AuthStore {
  whatsAppAuth: {
    findUnique(args: { where: { id: string } }): Promise<{ data: string } | null>;
    findMany(args: { where: { id: { in: string[] } } }): Promise<{ id: string; data: string }[]>;
    upsert(args: { where: { id: string }; create: { id: string; data: string }; update: { data: string } }): Promise<unknown>;
    deleteMany(args: { where?: { id: { in: string[] } } }): Promise<unknown>;
  };
}

const CREDS_ID = 'creds';
const keyId = (type: string, id: string) => `${type}-${id}`;
const serialize = (value: unknown) => JSON.stringify(value, BufferJSON.replacer);
const parse = (data: string) => JSON.parse(data, BufferJSON.reviver);

/**
 * Baileys auth state stored in the database, one row per key (same layout as useMultiFileAuthState,
 * which Baileys itself does not recommend for production). Needed on hosts whose disk is wiped on
 * every restart, such as Render's free tier.
 */
export async function useDatabaseAuthState(db: AuthStore): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const write = (id: string, value: unknown) => {
    const data = serialize(value);
    return db.whatsAppAuth.upsert({ where: { id }, create: { id, data }, update: { data } });
  };

  const stored = await db.whatsAppAuth.findUnique({ where: { id: CREDS_ID } });
  const creds: AuthenticationCreds = stored ? parse(stored.data) : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const rows = await db.whatsAppAuth.findMany({ where: { id: { in: ids.map((id) => keyId(type, id)) } } });
          const byId = new Map(rows.map((r) => [r.id, r.data]));
          const result: { [id: string]: SignalDataTypeMap[T] } = {};
          for (const id of ids) {
            const data = byId.get(keyId(type, id));
            if (!data) continue;
            let value = parse(data);
            if (type === 'app-state-sync-key') value = proto.Message.AppStateSyncKeyData.fromObject(value);
            result[id] = value;
          }
          return result;
        },
        set: async (data: SignalDataSet) => {
          const removed: string[] = [];
          const writes: Promise<unknown>[] = [];
          for (const type of Object.keys(data) as (keyof SignalDataSet)[]) {
            for (const [id, value] of Object.entries(data[type] ?? {})) {
              if (value) writes.push(write(keyId(type, id), value));
              else removed.push(keyId(type, id));
            }
          }
          if (removed.length) writes.push(db.whatsAppAuth.deleteMany({ where: { id: { in: removed } } }));
          await Promise.all(writes);
        },
      },
    },
    saveCreds: async () => {
      await write(CREDS_ID, creds);
    },
  };
}

/** Logs the bot out locally: the next connection shows a new QR code. */
export async function clearDatabaseAuthState(db: AuthStore) {
  await db.whatsAppAuth.deleteMany({});
}
