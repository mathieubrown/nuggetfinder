#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
: "${NUGGETFINDER_LOCAL_PG_URL:?Set a loopback PostgreSQL URL}"
: "${NUGGETFINDER_LOCAL_PG_CONTAINER:?Set the dedicated local PostgreSQL container name}"
modules="$PWD/services/participation/node_modules"
export NUGGETFINDER_PG="${NUGGETFINDER_PG:-$modules/pg}"
export NUGGETFINDER_PGLITE="${NUGGETFINDER_PGLITE:-$modules/@electric-sql/pglite}"
export NUGGETFINDER_PLAYWRIGHT="${NUGGETFINDER_PLAYWRIGHT:-$modules/playwright}"
export NUGGETFINDER_TEST_REST=1
: "${NUGGETFINDER_PYTHON:?Set an isolated Python 3.13 interpreter with services/photo/requirements.txt installed}"
node --test tests/*.cjs
"$NUGGETFINDER_PYTHON" -m unittest discover -s tests/photo -v
node tests/browser/participation-runtime.cjs
