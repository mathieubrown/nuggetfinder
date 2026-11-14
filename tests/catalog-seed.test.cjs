const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

test('starter stock links use the same OSM locations as the map', () => {
  const window = {};
  runInNewContext(readFileSync('js/catalog-seed.js', 'utf8'), { window });
  const { places, products, links } = window.NuggetfinderSeed;
  const migration = readFileSync('supabase/migrations/20261114000200_seed_product_catalog.sql', 'utf8');
  assert.equal(new Set(places.map(place => place.id)).size, places.length);
  for (const place of places) {
    assert.match(place.id, /^(node|way|relation)\/[1-9]\d*$/);
    assert.equal(place.source, 'openstreetmap');
    assert.ok(migration.includes("('" + place.id + "',"));
  }
  for (const product of products) {
    const brandPlaces = places.filter(place => place.name === product.brand);
    const linked = links.filter(link => link.product_id === product.id);
    assert.ok(brandPlaces.length);
    assert.equal(linked.length, brandPlaces.length);
    for (const place of brandPlaces) {
      assert.ok(linked.some(link => link.place_id === place.id && link.places === place));
      assert.ok(migration.includes("('" + place.id + "', '" + product.id + "')"));
    }
  }
  assert.doesNotMatch(migration, /insert into public\.(stock_reports|reports)|seed\//);
});
