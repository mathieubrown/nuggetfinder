# OpenStreetMap attribution

© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). The location data is available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

The starter locations come from the [BBBike San Francisco extract](https://download.bbbike.org/osm/bbbike/SanFrancisco/), dated November 7, 2026 and accessed November 14, 2026. The snapshot filters the existing map bounds for food businesses matching the five catalog brands. Locations tagged in Colma or Pacifica were excluded. The extract preserves original OpenStreetMap node and way IDs. Way coordinates are the centers of their bounding boxes.

The location subset is distributed in the starter catalog migration and `js/catalog-seed.js`. Links to branded products are where-to-buy leads. They carry no stock or allergen claims.

The grocery snapshot uses the same BBBike PBF extract. The filtered records are in `grocery_places.csv`. The snapshot uses the app's existing bounds. It excludes shops tagged in Pacifica, Colma or San Bruno and separates unrelated name matches and Costco Business Center from standard store leads. Blank city fields were retained within the map bounds. No matching Walmart was found in the extract and area.

## Self-hosted fonts

Archivo Black and Space Grotesk are distributed under the SIL Open Font License 1.1. Font files and their license notices are in `vendor/fonts/`. Sources: [Archivo Black](https://github.com/google/fonts/tree/main/ofl/archivoblack) and [Space Grotesk](https://github.com/google/fonts/tree/main/ofl/spacegrotesk), accessed November 25, 2026. The private participation client serves these locally and shows OpenStreetMap credit for its store catalog.

## Search candidates, November 25, 2026

`place_search_snapshot.json` contains 4,609 named public food businesses from the same BBBike San Francisco PBF extract, whose header reports `2026-11-07T00:00:00Z`. This subset is © OpenStreetMap contributors, under ODbL 1.0, and preserves node/way IDs. The extract was downloaded November 14 and this search subset was processed November 25, 2026. The input SHA-256 is recorded in the JSON. Way positions are bounding-box centers. Bounds are 37.62 to 37.812 latitude and -122.53 to -122.35 longitude. Search results are dated candidates, not approved places, stock, menu, price or allergen claims. Use `scripts/extract-place-search.py` to reproduce the subset from the source PBF.

The optional bounded live adapter uses [Overpass](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html); it is not a generic Nominatim geocoder. New search and pin maps retain visible OpenStreetMap credit. The map proxy follows the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) with application identification, origin-only Referer, response-driven caching and conditional revalidation. It has no prefetch or offline-download feature. Sources checked November 25, 2026. Live service availability remains unproven; default search works from the dated local snapshot.
