// Run with NUGGETFINDER_PGLITE pointing to a local @electric-sql/pglite installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {PGlite} = require(process.env.NUGGETFINDER_PGLITE || '@electric-sql/pglite');

test('discovery database permissions and normal entry points', async t => {
  const db = new PGlite();
  const users = [1, 2, 3].map(index => '00000000-0000-0000-0000-00000000000' + index);
  async function actor(index, role = 'authenticated') {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [index === null ? '' : users[index]]);
    await db.exec('set role ' + role);
  }
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb, email text);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
    const directory = path.join(__dirname, '../supabase/migrations');
    for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
      await db.exec(fs.readFileSync(path.join(directory, name), 'utf8'));
    }
    for (const id of users) {
      await db.query("insert into auth.users values($1, '{\"age_confirmed\":true}', 'local@example.test')", [id]);
    }
    await db.query('update public.profiles set is_moderator = true where id = $1', [users[0]]);

    await t.test('private saved lists use real targets and upsert a single state', async () => {
      await actor(null, 'anon');
      await assert.rejects(db.query('select public.my_discoveries()'), /permission denied/);
      await actor(1);
      await assert.rejects(db.query("select public.save_discovery('product', 'invented', 'want')"), /invalid_saved_item/);
      await db.query("select public.save_discovery('product', 'mcnuggets', 'want')");
      await assert.rejects(db.query("select public.save_discovery('product', 'mcnuggets', 'tried')"), /save_cooldown/);
      await db.exec('reset role');
      await db.query("update public.saved_items set updated_at = now() - interval '3 seconds'");
      await actor(1);
      await db.query("select public.save_discovery('product', 'mcnuggets', 'tried')");
      let rows = (await db.query('select public.my_discoveries() items')).rows[0].items;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].list_state, 'tried');
      assert.equal(rows[0].subject.page, 'product');
      await assert.rejects(db.query('select * from public.saved_items'), /permission denied/);
      await actor(2);
      assert.deepEqual((await db.query('select public.my_discoveries() items')).rows[0].items, []);
      await actor(1);
      const exported = (await db.query('select public.export_discovery_data() data')).rows[0].data;
      assert.equal(exported.saved_items.length, 1);
      await db.query("select public.save_discovery('product', 'mcnuggets', null)");
      assert.deepEqual((await db.query('select public.my_discoveries() items')).rows[0].items, []);
      await db.exec('reset role');
      await db.query('update public.profiles set banned = true where id = $1', [users[1]]);
      await actor(1);
      await assert.rejects(db.query("select public.save_discovery('product', 'mcnuggets', 'want')"), /posting_unavailable/);
      await db.exec('reset role');
      await db.query('update public.profiles set banned = false where id = $1', [users[1]]);
    });
  } finally {
    await db.close();
  }
});
