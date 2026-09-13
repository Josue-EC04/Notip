const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const session = { user: { id: 'google-user' }, access_token: 'access', refresh_token: 'refresh', expires_at: 1 };

function fixture(auth = {}) {
  const data = new Map();
  class Store {
    get(key, fallback) { return data.has(key) ? data.get(key) : fallback; }
    set(key, value) { data.set(key, value); }
    delete(key) { data.delete(key); }
  }
  const context = { module: { exports: {} }, process: { env: {} }, console: { log() {}, warn() {}, error() {} },
    require(id) {
      if (id === 'electron-store') return Store;
      if (id === 'ws') return {};
      if (id === '@supabase/supabase-js') return { createClient: () => ({ auth }) };
      throw Error(id);
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/supabase/client.js'), 'utf8'), context);
  return { client: context.module.exports, data };
}

test('guest flags and incomplete saved user cannot grant remembered access', () => {
  const { client, data } = fixture();
  data.set('local_mode', true);
  assert.equal(client.getStoredSession(), null);
  data.set('sb-session', { user: { id: 'guest' } });
  assert.equal(client.getStoredSession(), null);
});

test('expired Google session survives network failure', async () => {
  const { client } = fixture({ refreshSession: async () => { throw Error('offline'); } });
  client.storeSession(session);
  assert.equal((await client.restoreOrRefreshSession()).user.id, session.user.id);
  assert.equal(client.getStoredUser().id, session.user.id);
});

test('explicit logout clears local access without waiting for the network', async () => {
  const { client } = fixture({ signOut: () => new Promise(() => {}) });
  client.storeSession(session);
  await client.signOut();
  assert.equal(client.getStoredSession(), null);
});

test('late refresh cannot restore a session after explicit logout', async () => {
  let finish;
  const { client } = fixture({ refreshSession: () => new Promise(resolve => { finish = resolve; }), signOut: async () => ({}) });
  client.storeSession(session);
  const pending = client.restoreOrRefreshSession();
  await client.signOut();
  finish({ data: { session: { ...session, access_token: 'new' } }, error: null });
  assert.equal(await pending, null);
  assert.equal(client.getStoredSession(), null);
});

test('server-revoked refresh token requires Google again', async () => {
  const { client } = fixture({ refreshSession: async () => ({ error: { message: 'Invalid Refresh Token' } }) });
  client.storeSession(session);
  assert.equal(await client.restoreOrRefreshSession(), null);
  assert.equal(client.getStoredUser(), null);
});
