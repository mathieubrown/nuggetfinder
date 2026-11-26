# OpenStreetMap attribution

© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). The location data is available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

The starter locations come from the [BBBike San Francisco extract](https://download.bbbike.org/osm/bbbike/SanFrancisco/), dated November 7, 2026 and accessed November 14, 2026. The snapshot filters the existing map bounds for food businesses matching the five catalog brands. Locations tagged in Colma or Pacifica were excluded. The extract preserves original OpenStreetMap node and way IDs. Way coordinates are the centers of their bounding boxes.

The location subset is distributed in the starter catalog migration and `js/catalog-seed.js`. Links to branded products are where-to-buy leads. They carry no stock or allergen claims.

The grocery snapshot uses the same BBBike PBF extract. The filtered records are in `grocery_places.csv`. The snapshot uses the app's existing bounds. It excludes shops tagged in Pacifica, Colma or San Bruno and separates unrelated name matches and Costco Business Center from standard store leads. Blank city fields were retained within the map bounds. No matching Walmart was found in the extract and area.

## Self-hosted fonts

Archivo Black and Space Grotesk are distributed under the SIL Open Font License 1.1. Font files and their license notices are in `vendor/fonts/`. Sources: [Archivo Black](https://github.com/google/fonts/tree/main/ofl/archivoblack) and [Space Grotesk](https://github.com/google/fonts/tree/main/ofl/spacegrotesk), accessed November 25, 2026. The private participation client serves these locally and shows OpenStreetMap credit for its store catalog.
