# FDA and USDA recall feeds

Accessed November 14, 2026. Confidence: high for the FDA weekly API and FSIS notices, medium for FSIS machine-feed coverage.

FDA publishes food enforcement data at `https://api.fda.gov/food/enforcement.json` and updates it weekly. Read recall number, classification, status, reason, product description, code information, distribution, firm and dates. UPC and lot identifiers may appear inside description or code text. FDA public announcements are a separate source. [openFDA overview](https://open.fda.gov/apis/food/enforcement/) · [API searchable fields](https://open.fda.gov/apis/food/enforcement/searchable-fields/) · [FDA announcements](https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts)

USDA FSIS publishes dated recalls and public health alerts for its regulated products, including poultry. Read announcement ID, date, class, location, establishment number, package sizes, lot and date windows where the notice supplies them. FSIS does not give a guaranteed fixed update schedule in the source reviewed. FSIS documents a public JSON API at `https://www.fsis.usda.gov/fsis/api/recall/v/1`. The archive returned HTTP 403 in this research environment. Verify machine access and field coverage in staging before relying on it. [FSIS launch notice](https://content.govdelivery.com/accounts/USFSIS/bulletins/36f124b) · [FSIS developer API](https://www.fsis.usda.gov/science-data/developer-resources/recall-api) [FSIS Recalls & Public Health Alerts](https://www.fsis.usda.gov/recalls) · [FSIS product lookup guidance](https://ask.fsis.usda.gov/article/Is-my-product-part-of-a-recall)

Match UPC plus lot/date when present. Check establishment and name/size as additional clues, and route uncertain matches to a person. Keep the original link and show when the app last checked the source.

Counsel questions: How should we word alerts for possible matches, document correction or withdrawal, and retain notice history?
