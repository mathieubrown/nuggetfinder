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

    await t.test('taste follows reuse the feed and honor mutual blocks without exposing saves', async () => {
      await actor(1);
      await assert.rejects(db.query('select public.set_follow($1,true)', [users[1]]), /invalid_follow/);
      await db.query('select public.set_follow($1,true)', [users[2]]);
      let profile = (await db.query('select public.taste_profile($1) profile', [users[2]])).rows[0].profile;
      assert.equal(profile.following, true);
      assert.equal(profile.take_count, 1);
      assert.equal(profile.takes.length, 1);
      assert.equal('saved_items' in profile, false);
      assert.equal((await db.query("select * from public.community_feed('following')")).rowCount, 1);
      assert.equal((await db.query('select public.my_taste_follows() follows')).rows[0].follows.length, 1);
      await db.exec('reset role');
      await db.query("update public.profiles set handle='test_taster' where id=$1", [users[2]]);
      await actor(1);
      assert.equal((await db.query("select public.find_tastes('test_') people")).rows[0].people.length, 1);
      assert.deepEqual((await db.query("select public.find_tastes('%') people")).rows[0].people, []);
      await actor(2);
      await db.query('select public.set_user_block($1,true)', [users[1]]);
      await actor(1);
      assert.equal((await db.query('select public.taste_profile($1) profile', [users[2]])).rows[0].profile, null);
      assert.deepEqual((await db.query('select public.my_taste_follows() follows')).rows[0].follows, []);
      await assert.rejects(db.query('select public.set_follow($1,true)', [users[2]]), /profile_unavailable/);
      await actor(2);
      await db.query('select public.set_user_block($1,false)', [users[1]]);
      await actor(null, 'anon');
      profile = (await db.query('select public.taste_profile($1) profile', [users[2]])).rows[0].profile;
      assert.equal(profile.following, false);
      await assert.rejects(db.query('select public.my_taste_follows()'), /permission denied/);
      await assert.rejects(db.query('select public.set_follow($1,true)', [users[2]]), /permission denied/);
    });

    await t.test('trails enforce real stops, review versions and private progress', async () => {
      await actor(1);
      await assert.rejects(db.query("select public.submit_discovery_trail('Bad trail','No real places',array['invented'])"), /invalid_trail/);
      await assert.rejects(db.query("select public.submit_discovery_trail('Duplicate stops','A test',array['node/1229920544','node/1229920544'])"), /invalid_trail/);
      const trailId = (await db.query("select public.submit_discovery_trail('Nugget expedition','Two real places to explore.',array['node/1229920544','node/358116917']) id")).rows[0].id;
      assert.deepEqual((await db.query('select public.list_trails() trails')).rows[0].trails, []);
      assert.equal((await db.query('select public.list_trails(null,true) trails')).rows[0].trails.length, 1);
      await actor(2);
      await assert.rejects(db.query("select public.submit_discovery_trail('Stolen trail','Not the author',array['node/1229920544'],$1)", [trailId]), /trail_unavailable/);
      await actor(0);
      let inbox = (await db.query('select public.moderation_inbox() inbox')).rows[0].inbox;
      const firstReview = inbox.queue.find(row => row.kind === 'trail').id;
      // Editing a pending nomination makes its earlier review obsolete.
      await db.exec('reset role');
      await db.query("update public.discovery_trails set updated_at=now()-interval '3 minutes'");
      await actor(1);
      await db.query("select public.submit_discovery_trail('Nugget expedition revised','Two real places.',array['node/1229920544','node/358116917'],$1)", [trailId]);
      await actor(0);
      await db.query("select public.review_content($1,'approve')", [firstReview]);
      assert.deepEqual((await db.query('select public.list_trails() trails')).rows[0].trails, []);
      inbox = (await db.query('select public.moderation_inbox() inbox')).rows[0].inbox;
      await db.query("select public.review_content($1,'approve')", [inbox.queue.find(row => row.kind === 'trail').id]);
      await actor(2);
      let trail = (await db.query('select public.list_trails() trails')).rows[0].trails[0];
      assert.equal(trail.stops.length, 2);
      await db.query("select public.mark_trail_stop($1,'node/1229920544',true)", [trailId]);
      await db.query("select public.mark_trail_stop($1,'node/1229920544',true)", [trailId]);
      trail = (await db.query('select public.list_trails() trails')).rows[0].trails[0];
      assert.equal(trail.visited, 1);
      await assert.rejects(db.query("select public.mark_trail_stop($1,'invented',true)", [trailId]), /trail_unavailable/);
      await actor(1);
      trail = (await db.query('select public.list_trails() trails')).rows[0].trails[0];
      assert.equal(trail.visited, 0);
      await db.exec('reset role');
      await db.query("update public.discovery_trails set updated_at=now()-interval '3 minutes'");
      await actor(1);
      await db.query("select public.submit_discovery_trail('Nugget expedition reordered','The other direction.',array['node/358116917','node/1229920544'],$1)", [trailId]);
      await actor(0);
      inbox = (await db.query('select public.moderation_inbox() inbox')).rows[0].inbox;
      await db.query("select public.review_content($1,'approve')", [inbox.queue.find(row => row.kind === 'trail').id]);
      await actor(2);
      trail = (await db.query('select public.list_trails() trails')).rows[0].trails[0];
      assert.equal(trail.stops[0].id, 'node/358116917');
      assert.equal(trail.stops[1].tried, true);
      assert.equal(trail.visited, 1);
      await db.query("select public.save_discovery('trail',$1,'want')", [String(trailId)]);
      const exported = (await db.query('select public.export_discovery_data() data')).rows[0].data;
      assert.equal(exported.trail_progress.length, 1);
      assert.deepEqual(exported.trails, []);
      assert.deepEqual(exported.trail_stops, []);
      await db.query("select public.report_discovery('trail',$1,'other')", [String(trailId)]);
      await actor(0);
      inbox = (await db.query('select public.moderation_inbox() inbox')).rows[0].inbox;
      await db.query("select public.review_content($1,'hide')", [inbox.queue.find(row => row.kind === 'trail_report').id]);
      await actor(2);
      assert.deepEqual((await db.query('select public.list_trails() trails')).rows[0].trails, []);
      await assert.rejects(db.query('select * from public.trail_progress'), /permission denied/);
      await db.query("select public.mark_trail_stop($1,'node/1229920544',false)", [trailId]);
    });

    await t.test('all discovery tables and helper functions are private', async () => {
      await db.exec('reset role');
      for (const table of ['saved_items','court_cases','court_votes','court_locations','discovery_trails','trail_stops','trail_progress','place_ratings','place_matchups','business_verifications','product_allergen_sources','price_entries']) {
        const row = (await db.query("select relrowsecurity as rls from pg_class where oid=$1::regclass", ['public.' + table])).rows[0];
        assert.equal(row.rls, true);
        for (const role of ['anon','authenticated']) {
          const grants = (await db.query("select privilege from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) privilege where has_table_privilege($1,$2,privilege)", [role,'public.'+table])).rows;
          assert.deepEqual(grants, []);
        }
      }
      for (const name of ['discovery_subject(text,text)','discovery_author_visible(uuid)','court_visible(bigint)',
        'trail_visible(bigint)','report_court_discovery(text,text,text)','export_court_data()']) {
        for (const role of ['anon','authenticated']) {
          assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed", [role,'public.'+name])).rows[0].allowed, false);
        }
      }
    });

    await t.test('place scores require three people and ratings stay private', async () => {
      for (const [index,score] of [[0,2],[1,3],[2,4]]) {
        await actor(index);
        await db.query('select public.rate_place($1,$2,$2,$2,$2)', ['node/1229920544',score]);
        const ratings=(await db.query("select public.place_screen('node/1229920544') data")).rows[0].data.ratings;
        assert.equal(ratings.count,index+1);
        assert.equal(ratings.crunch,index<2?null:3);
      }
      await assert.rejects(db.query("select public.rate_place('node/1229920544',1,1,1,1)"), /rating_cooldown/);
      await assert.rejects(db.query("select public.rate_place('node/358116917',0,1,1,1)"), /invalid_rating/);
      await assert.rejects(db.query('select * from public.place_ratings'), /permission denied/);
      const own=(await db.query('select public.export_discovery_data() data')).rows[0].data;
      assert.equal(own.place_ratings.length,1);
      await db.exec('reset role');
      await db.query('update public.profiles set banned=true where id=$1',[users[1]]);
      await actor(null,'anon');
      const ratings=(await db.query("select public.place_screen('node/1229920544') data")).rows[0].data.ratings;
      assert.equal(ratings.count,2);
      assert.equal(ratings.crunch,null);
      await assert.rejects(db.query("select public.rate_place('node/1229920544',1,1,1,1)"), /permission denied/);
      await db.exec('reset role');
      await db.query('update public.profiles set banned=false where id=$1',[users[1]]);
    });

    await t.test('stamps, team votes, rebuttals and hidden ancestors use real content', async () => {
      await actor(1);
      const root=(await db.query("select public.submit_context_take('matchup','cane-vs-cfa','Sauce on the side.','sauce_heretic',null,null,'node/358116917') data")).rows[0].data;
      await actor(0);
      if(root.status!=='published') {
        const review=(await db.query('select public.moderation_inbox() inbox')).rows[0].inbox.queue.find(row=>row.kind==='take' && row.content_ref===String(root.id));
        await db.query("select public.review_content($1,'approve')",[review.id]);
      }
      await actor(1);
      await db.query("select public.vote_matchup('cane-vs-cfa','left')");
      await actor(2);
      const child=(await db.query("select public.submit_context_take('matchup','cane-vs-cfa','I disagree.','nope',$1,$2,null) data",[root.id,users[1]])).rows[0].data;
      if(child.status!=='published') {
        await actor(0);
        const review=(await db.query('select public.moderation_inbox() inbox')).rows[0].inbox.queue.find(row=>row.kind==='take' && row.content_ref===String(child.id));
        await db.query("select public.review_content($1,'approve')",[review.id]);
      }
      await actor(2);
      await db.query("select public.respond_take($1,'against')",[root.id]);
      const card=(await db.query('select public.take_cards(p_take=>$1) cards',[root.id])).rows[0].cards[0];
      assert.equal(card.stamp,'sauce_heretic');
      assert.equal(card.team,'left');
      assert.equal(card.clowned,1);
      assert.equal(card.rebuttals,1);
      const children=(await db.query('select public.take_cards(p_parent=>$1) cards',[root.id])).rows[0].cards;
      assert.equal(children[0].parent_take_id,root.id);
      await assert.rejects(db.query("select public.submit_context_take('product','mcnuggets','Wrong subject',null,$1)",[root.id]),/rebuttal_unavailable/);
      await db.query("select public.report_content('take',$1,'other')",[String(root.id)]);
      await actor(0);
      const report=(await db.query('select public.moderation_inbox() inbox')).rows[0].inbox.queue.find(row=>row.kind==='take' && row.content_ref===String(root.id));
      await db.query("select public.review_content($1,'hide')",[report.id]);
      await actor(null,'anon');
      assert.deepEqual((await db.query('select public.take_cards(p_take=>$1) cards',[child.id])).rows[0].cards,[]);
    });

    await t.test('price history is append-only, unit-comparable and verification is server-controlled', async () => {
      const place='node/1229920544';
      await actor(1);
      await db.query("select public.submit_price($1,'mcnuggets',10,20,'piece')",[place]);
      await db.query("select public.submit_stock_report('mcnuggets',$1,'seen')",[place]);
      await assert.rejects(db.query("select public.submit_price($1,'mcnuggets',9,20,'piece')",[place]),/price_cooldown/);
      await assert.rejects(db.query("select public.submit_price($1,'mcd-bbq',9,0.5,'piece')",[place]),/invalid_price/);
      await assert.rejects(db.query("select public.submit_price($1,'mcd-bbq',9.999,20,'piece')",[place]),/invalid_price/);
      await assert.rejects(db.query('update public.price_entries set price=1'),/permission denied/);
      await actor(2);
      await db.query("select public.submit_price($1,'mcnuggets',9,20,'piece')",[place]);
      let entries=(await db.query("select public.price_ledger($1,'piece') entries",[place])).rows[0].entries;
      assert.equal(entries.length,2);
      assert.equal(entries[0].price,9);
      assert.equal(entries[0].unit_cost,0.45);
      assert.equal(entries[0].verified_store,false);
      assert.equal(entries[0].stock.seen_count,1);
      assert.equal(entries[0].stock.sold_out_count,0);
      assert.equal(entries[1].superseded,true);
      assert.match(entries[0].masked_handle,/^.{1}\*{4}.{1}$/);
      assert.equal('user_id' in entries[0],false);
      await db.exec('reset role');
      await db.query("insert into public.business_verifications(user_id,place_id,source_url) values($1,$2,'https://example.test/local-proof')",[users[1],place]);
      await db.query("update public.price_entries set created_at=now()-interval '11 minutes'");
      await actor(1);
      await db.query("select public.submit_price($1,'mcnuggets',10,20,'piece')",[place]);
      await actor(2);
      await db.query("select public.submit_price($1,'mcnuggets',8,20,'piece')",[place]);
      entries=(await db.query("select public.price_ledger($1,'piece') entries",[place])).rows[0].entries;
      assert.equal(entries[0].price,10);
      assert.equal(entries[0].verified_store,true);
      assert.equal(entries.filter(row=>!row.superseded).length,1);
      assert.deepEqual((await db.query("select public.price_ledger($1,'g') entries",[place])).rows[0].entries,[]);
      const data=(await db.query('select public.export_discovery_data() data')).rows[0].data;
      assert.equal(data.price_entries.length,2);
      await db.exec('reset role');
      await db.query('update public.business_verifications set revoked_at=now()');
      entries=(await db.query("select public.price_ledger($1,'piece') entries",[place])).rows[0].entries;
      assert.equal(entries[0].price,8);
      assert.equal(entries[0].verified_store,false);
      await assert.rejects(db.query("insert into public.product_allergen_sources(product_id,allergen,state,source_kind) values('mcnuggets','gluten','confirmed_free','package')"),/check constraint/);
      await db.query("insert into public.product_allergen_sources(product_id,allergen,state,source_kind,source_url) values('mcnuggets','gluten','confirmed_free','package','https://example.test/local-label')");
      await db.query("insert into public.product_allergen_sources(product_id,allergen,state,source_kind) values('mcnuggets','gluten','contains','crowd')");
      await actor(null,'anon');
      const evidence=(await db.query("select public.product_allergen_evidence('mcnuggets') evidence")).rows[0].evidence;
      assert.equal(evidence[0].state,'contains');
      await assert.rejects(db.query("select public.submit_price($1,'mcnuggets',9,20,'piece')",[place]),/permission denied/);
    });
  } finally {
    await db.close();
  }
});
