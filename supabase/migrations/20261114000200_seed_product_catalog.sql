-- STARTER CATALOG: existing sample map pins and suggested chain menu matches.
-- These are leads for browsing. There are no stock reports or allergen claims.
begin;
insert into public.products (id, brand, name, kind) values
  ('mcnuggets', 'McDonald''s', 'Chicken McNuggets', 'nuggets'),
  ('mcd-bbq', 'McDonald''s', 'Tangy Barbeque Sauce', 'sauce'),
  ('mcd-sweet-sour', 'McDonald''s', 'Sweet ’N Sour Sauce', 'sauce'),
  ('cfa-nuggets', 'Chick-fil-A', 'Chick-fil-A Nuggets', 'nuggets'),
  ('cfa-strips', 'Chick-fil-A', 'Chick-n-Strips', 'tenders'),
  ('cfa-sauce', 'Chick-fil-A', 'Chick-fil-A Sauce', 'sauce'),
  ('popeyes-tenders', 'Popeyes', 'Classic Tenders', 'tenders'),
  ('popeyes-blackened', 'Popeyes', 'Blackened Tenders', 'tenders'),
  ('popeyes-ranch', 'Popeyes', 'Blackened Ranch', 'sauce'),
  ('kfc-nuggets', 'KFC', 'KFC Nuggets', 'nuggets'),
  ('kfc-tenders', 'KFC', 'Original Recipe Tenders', 'tenders'),
  ('kfc-sauce', 'KFC', 'KFC Sauce', 'sauce'),
  ('canes-fingers', 'Raising Cane''s', 'Chicken Fingers', 'tenders'),
  ('canes-sauce', 'Raising Cane''s', 'Cane’s Sauce', 'sauce'),
  ('canes-honey-mustard', 'Raising Cane''s', 'Honey Mustard', 'sauce');
insert into public.places (id, name, area, latitude, longitude, source) values
  ('seed/1', 'McDonald''s', 'Union Square', 37.7879, -122.4075, 'map_sample'),
  ('seed/2', 'Chick-fil-A', 'SOMA', 37.7849, -122.3974, 'map_sample'),
  ('seed/3', 'Popeyes', 'Mission', 37.7599, -122.4148, 'map_sample'),
  ('seed/4', 'KFC', 'Chinatown', 37.7941, -122.4078, 'map_sample'),
  ('seed/5', 'Raising Cane''s', 'Castro', 37.7609, -122.435, 'map_sample');
insert into public.place_products (place_id, product_id) values
  ('seed/1', 'mcnuggets'),
  ('seed/1', 'mcd-bbq'),
  ('seed/1', 'mcd-sweet-sour'),
  ('seed/2', 'cfa-nuggets'),
  ('seed/2', 'cfa-strips'),
  ('seed/2', 'cfa-sauce'),
  ('seed/3', 'popeyes-tenders'),
  ('seed/3', 'popeyes-blackened'),
  ('seed/3', 'popeyes-ranch'),
  ('seed/4', 'kfc-nuggets'),
  ('seed/4', 'kfc-tenders'),
  ('seed/4', 'kfc-sauce'),
  ('seed/5', 'canes-fingers'),
  ('seed/5', 'canes-sauce'),
  ('seed/5', 'canes-honey-mustard');
commit;
