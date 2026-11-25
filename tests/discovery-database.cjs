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

    await t.test('Court nominations, locations and arguments stay hidden until reviewed', async () => {
      await actor(1);
      const id = (await db.query("select public.nominate_court_case('Chicken katsu','A very flat nugget?') id")).rows[0].id;
      assert.deepEqual((await db.query('select public.court_cases() cases')).rows[0].cases, []);
      await assert.rejects(db.query("select public.vote_court($1,'nugget')", [id]), /round_unavailable/);
      await assert.rejects(db.query("select public.nominate_court_case('CHICKEN KATSU','Duplicate case')"), /food_already_nominated/);
      await actor(0);
      const queueId = (await db.query("select public.moderation_inbox() inbox")).rows[0].inbox.queue.find(row => row.kind === 'court').id;
      await db.query("select public.review_content($1,'approve')", [queueId]);
      await actor(1);
      const cases = (await db.query('select public.court_cases() cases')).rows[0].cases;
      assert.equal(cases.length, 1);
      assert.equal(cases[0].verdict, 'open');
      assert.equal(new Date(cases[0].closes_at) - new Date(cases[0].opened_at), 7 * 86400000);
      await db.query("select public.vote_court($1,'nugget')", [id]);
      await assert.rejects(db.query("select public.vote_court($1,'no')", [id]), /vote_cooldown/);
      await db.exec('reset role');
      await db.query("update public.court_votes set updated_at=now()-interval '6 seconds'");
      await actor(1);
      await db.query("select public.vote_court($1,'adjacent')", [id]);
      let updated = (await db.query('select public.court_cases() cases')).rows[0].cases[0];
      assert.equal(updated.nugget, 0);
      assert.equal(updated.adjacent, 1);
      await db.query("select public.suggest_court_location($1,'node/1229920544')", [id]);
      assert.deepEqual((await db.query('select public.court_locations($1) places', [id])).rows[0].places, []);
      await actor(0);
      const locationReview = (await db.query('select public.moderation_inbox() inbox')).rows[0].inbox.queue.find(row => row.kind === 'court_location');
      await db.query("select public.review_content($1,'approve')", [locationReview.id]);
      await actor(2);
      assert.equal((await db.query('select public.court_locations($1) places', [id])).rows[0].places.length, 1);
      await db.query('select public.set_user_block($1,true)', [users[1]]);
      assert.deepEqual((await db.query('select public.court_cases() cases')).rows[0].cases, []);
      await db.query('select public.set_user_block($1,false)', [users[1]]);
      await db.query("select public.submit_take('court',$1,'The breading rests its case.')", [String(id)]);
      assert.deepEqual((await db.query('select public.court_takes($1) takes', [id])).rows[0].takes, []);
      await actor(0);
      const takeReview = (await db.query('select public.moderation_inbox() inbox')).rows[0].inbox.queue.find(row => row.kind === 'take');
      await db.query("select public.review_content($1,'approve')", [takeReview.id]);
      await actor(2);
      assert.equal((await db.query('select public.court_takes($1) takes', [id])).rows[0].takes.length, 1);
      await db.query("select public.report_discovery('court',$1,'other')", [String(id)]);
      await db.query("select public.report_discovery('court',$1,'other')", [String(id)]);
      await actor(0);
      const reports = (await db.query('select public.moderation_inbox() inbox')).rows[0].inbox.queue.filter(row => row.kind === 'court_report');
      assert.equal(reports.length, 1);
      await db.query("select public.review_content($1,'hide')", [reports[0].id]);
      await actor(2);
      assert.deepEqual((await db.query('select public.court_takes($1) takes', [id])).rows[0].takes, []);
      assert.equal((await db.query("select * from public.community_feed('recent')")).rowCount, 0);
    });

    await t.test('Court verdict rules and closed rounds', async () => {
      await db.exec('reset role');
      for (const [nugget, adjacent, no, closed, expected] of [
        [0, 0, 0, false, 'open'], [19, 0, 0, true, 'insufficient'],
        [12, 5, 3, true, 'nugget'], [5, 12, 3, true, 'adjacent'], [3, 5, 12, true, 'no'],
        [10, 10, 0, true, 'divided'], [11, 5, 4, true, 'divided']
      ]) {
        const actual = (await db.query('select public.court_verdict($1,$2,$3,$4) verdict',
          [nugget, adjacent, no, closed])).rows[0].verdict;
        assert.equal(actual, expected);
      }
      await db.query("update public.court_cases set status='published',opened_at=now()-interval '8 days',closes_at=now()-interval '1 day'");
      await actor(1);
      await assert.rejects(db.query("select public.vote_court(1,'no')"), /round_unavailable/);
      const data = (await db.query('select public.export_discovery_data() data')).rows[0].data;
      assert.equal(data.court_nominations.length, 1);
      assert.equal(data.court_votes.length, 1);
      await assert.rejects(db.query('select * from public.court_votes'), /permission denied/);
      const guide = (await db.query('select public.court_cases(null,true) cases')).rows[0].cases;
      assert.deepEqual(guide, []);
    });
  } finally {
    await db.close();
  }
});
