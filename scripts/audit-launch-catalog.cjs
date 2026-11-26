'use strict';
const snapshot=require('../data/place_search_snapshot.json');

async function audit(client) {
  await client.query('begin read only');
  try {
    const {rows:[counts]}=await client.query(`
      select (select count(*)::int from products) products,
        (select count(*)::int from places) approved_places,
        (select count(*)::int from place_products) product_place_links,
        (select count(*)::int from place_products where link_kind='place_to_check') places_to_check,
        (select count(*)::int from products p where not exists(select 1 from place_products l where l.product_id=p.id)) products_without_places,
        (select count(*)::int from places where btrim(area)='') places_without_address_label,
        (select count(*)::int from places where latitude not between 37.62 and 37.812 or longitude not between -122.53 and -122.35) places_outside_bounds,
        (select count(*)::int from stock_reports) stock_observations,
        (select count(*)::int from price_entries) price_observations,
        (select count(*)::int from product_allergen_sources) allergen_evidence
    `);
    const {rows:kinds}=await client.query('select kind,count(*)::int as count from products group by kind order by kind');
    return {counts,kinds,snapshot:{date:snapshot.as_of,businesses:snapshot.places.length,source:snapshot.source,source_hash:snapshot.source_sha256},
      checked:'Row counts, links, source date and launch bounds. Business accuracy requires review.'};
  } finally { await client.query('rollback'); }
}
module.exports={audit};
