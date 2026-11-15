# Map data and tiles

Accessed November 14, 2026. Confidence: high for policy, medium for sizing.

The public Overpass manual gives roughly 10,000 requests and 1 GB of downloads per day as guidance for moderate use, not a guaranteed allocation. Queues and resource limits can produce 429 or 504 responses. A public app should serve catalog places from its own places table and refresh the OSM subset in a controlled batch. Keep canonical node, way and relation IDs. A sustained run of errors or rapid audience growth is a reason to stop live client queries. [Overpass manual](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)

The OSM Foundation tile service has no SLA or published fixed request allowance. Use the official tile URL, visible © OpenStreetMap contributors attribution linked to its copyright page, browser referrer and normal caching. No tile prefetch or offline bulk download. If usage becomes heavy or needs a guarantee, select a tile host with a suitable plan or host tiles. [Tile policy](https://operations.osmfoundation.org/policies/tiles/) · [OSM copyright and ODbL](https://www.openstreetmap.org/copyright)

Counsel questions: How should we publish the adapted OSM subset and keep independently collected stock reports separate? What attribution should accompany exported images and datasets?
