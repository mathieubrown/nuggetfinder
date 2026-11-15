# Blocked term import

Source consulted November 14, 2026. [LDNOOBW English word list](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/blob/master/en).

Save a reviewed copy as `data/private/blocked-terms.txt`, one term or phrase per line. The directory is ignored by Git. Review the source license, false positives, and suitability before production use. Whole-word and phrase checks are a first pass for human review.

After the moderation and takes migrations are installed, point the standard PostgreSQL environment variables at the approved target and run `scripts/load-blocked-terms.sh` with `psql` installed. The loader inserts into both lists in a transaction and prints only the distinct eligible row count. Repeated imports skip duplicates. Run against local PostgreSQL first.
