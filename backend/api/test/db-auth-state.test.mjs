// WhatsApp session stored in the database (src/whatsapp/db-auth-state.ts).
// Runs against the compiled code with the real Baileys package, which is ESM-only and cannot be
// loaded by Jest. No database needed: the Prisma table is replaced by an in-memory map.
//   npm run build && node --test test/db-auth-state.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { useDatabaseAuthState, clearDatabaseAuthState } = require('../dist/whatsapp/db-auth-state');
const { proto } = await import('@whiskeysockets/baileys');

function fakeStore() {
  const rows = new Map();
  const store = {
    whatsAppAuth: {
      findUnique: async ({ where }) => (rows.has(where.id) ? { data: rows.get(where.id) } : null),
      findMany: async ({ where }) => where.id.in.filter((id) => rows.has(id)).map((id) => ({ id, data: rows.get(id) })),
      upsert: async ({ where, create, update }) => rows.set(where.id, rows.has(where.id) ? update.data : create.data),
      deleteMany: async (args) => {
        if (!args?.where) rows.clear();
        else args.where.id.in.forEach((id) => rows.delete(id));
      },
    },
  };
  return { store, rows };
}

describe('useDatabaseAuthState', () => {
  test('creates credentials and restores them after a restart, Buffers included', async () => {
    const { store } = fakeStore();
    const first = await useDatabaseAuthState(store);
    assert.ok(Buffer.isBuffer(first.state.creds.noiseKey.private));
    await first.saveCreds();

    const afterRestart = await useDatabaseAuthState(store);
    assert.equal(afterRestart.state.creds.registrationId, first.state.creds.registrationId);
    assert.ok(Buffer.isBuffer(afterRestart.state.creds.noiseKey.private));
    assert.deepEqual(afterRestart.state.creds.noiseKey.private, first.state.creds.noiseKey.private);
  });

  test('stores, reads and deletes signal keys by type and id', async () => {
    const { store, rows } = fakeStore();
    const { state } = await useDatabaseAuthState(store);
    const preKey = { public: Buffer.from([1, 2, 3]), private: Buffer.from([4, 5, 6]) };

    await state.keys.set({ 'pre-key': { 7: preKey, 8: preKey } });
    assert.ok(rows.has('pre-key-7'));

    const got = await state.keys.get('pre-key', ['7', '9']);
    assert.deepEqual(got['7'].private, preKey.private);
    assert.equal(got['9'], undefined);

    await state.keys.set({ 'pre-key': { 7: null } });
    assert.ok(!rows.has('pre-key-7'));
    assert.ok(rows.has('pre-key-8'));
  });

  test('revives app-state-sync keys as protobuf objects', async () => {
    const { store } = fakeStore();
    const { state } = await useDatabaseAuthState(store);
    const key = proto.Message.AppStateSyncKeyData.fromObject({ keyData: Buffer.from([9, 9]), timestamp: 1 });

    await state.keys.set({ 'app-state-sync-key': { abc: key } });
    const got = await state.keys.get('app-state-sync-key', ['abc']);
    assert.ok(got.abc instanceof proto.Message.AppStateSyncKeyData);
    assert.deepEqual(Buffer.from(got.abc.keyData), Buffer.from([9, 9]));
  });

  test('clearing the store forces a new login (new credentials)', async () => {
    const { store, rows } = fakeStore();
    const first = await useDatabaseAuthState(store);
    await first.saveCreds();
    await clearDatabaseAuthState(store);
    assert.equal(rows.size, 0);
    const next = await useDatabaseAuthState(store);
    assert.notEqual(next.state.creds.registrationId, first.state.creds.registrationId);
  });
});
