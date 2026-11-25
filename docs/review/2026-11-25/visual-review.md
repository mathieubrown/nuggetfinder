# Mobile-first visual review

Reviewed November 25, 2026 against PR #33, d0174bb. Open index.html in this folder for the consolidated visual board. All recommendations below are proposals. No application layout, copy or rules were changed.

## Overall assessment

**Recognizably NuggetFinder, not yet ready to call visually finished.** The paper/ink palette, Archivo Black headings, pink creation button, crooked stamps and mascot give the six screens a shared identity. The strongest screens are Showdown and the dark composer. The weak points are action placement, too many menu-like navigation links, empty-state density and ambiguity between playful stamps and real confidence.

The review board starts with 390px mobile images, offers 1280px images and supplied references, and includes supporting one-report and stamped-take views. Fresh screenshots use the actual local database and simulated sessions. Their contributions are local test data. Map tiles are deliberately blank in the deterministic test capture; a separately labeled earlier map-context capture shows real tiles. Blank tiles are a test limitation, not an application design. These are browser images, not physical-phone evidence.

| Screen | Keep | Flag | Recommended next change |
| --- | --- | --- | --- |
| Main / map | Floating logo, category chips, outlined status pins, shopping link, bottom navigation | CONFUSING: the pink “I found nuggets / nope” action is after the long list and missing from the first mobile viewport. Repeated NO REPORTS pins are noisy. Tiny place names/addresses compete. | Keep report action reachable without scrolling through the store list. Use selected-pin emphasis and a calmer low-data map. Preserve visible OSM credit. |
| Spot | Big status stamp, rating threshold, real place identity | GENERIC / OVERLY SERIOUS: empty gray score bars plus several empty sections look like an unfinished dashboard. “Nuggets here / Nope” is ambiguous at a grocery: product-specific availability is elsewhere. | Give empty sections a mascot prompt and one useful next action. Explain place/menu status versus product stock. Do not invent ratings or active matchups to fill gaps. |
| Showdown | Red/gold opposing blocks, actual vote count, pink take action | CONFUSING: 100% with one vote looks conclusive even though the small count is truthful. Kicker says SAUCE WAR for all comparisons. VS is heading text rather than the reference's more theatrical splash. | Make small-sample status prominent, use matchup-specific copy, and add brief skippable VS personality. Keep reduced-motion static. |
| Take composer | Dark canvas, stamps, big Post control, “Roast the nugget, not the person” | CONFUSING: Record / Upload / Add photo look usable but only explain coming soon after tapping. Stamp selection can read like official verification. Large faux camera area feels odd for 280-character text. | Clearly label media as upcoming before a tap. Make text the main event. Label stamps as the author's chosen style; show an attached subject/parent clearly. |
| Badges / provenance guide | Cobalt reserved for paid units, source/identity distinction, explicit style-preview disclaimer | OVERLY SERIOUS: a dense guide rather than a consumer destination. “ALLERGEN FREE” sounds broader than a linked source can prove. CERTIFIED TENDER overlaps semantically with actual verified identities. | Keep guide secondary. Name the particular allergen and source/date in context. Explain author stamps versus store identity versus paid sponsorship separately. |
| Prices | Unit normalization, pack price, dated attribution, masked handle, preserved history | GENERIC / CONFUSING: spreadsheet-like rows, clipped store selector, BEST DEAL across unlike products, CURRENT means source priority rather than freshness. Stock chip and price date can look like one observation. | Surface product/pack identity and separate “price reported” from “stock last seen.” Say what Best Deal compares. Establish stale-price treatment before calling an old verified entry current. |

## Cross-screen journey

- Bottom navigation is consistent, but the plus means “take,” while Main's missing-above-fold pink action means “report.” Give these distinct intent labels. An in-store shopper should not accidentally open a social take.
- On mobile the upper navigation is hidden. Product shopping is discoverable from Main, but Court, trails, Field Guide and people are scattered under Showdown/profile links. Recommend a deliberate Discover entry or grouped hub instead of more links. This is an information-architecture decision, not a new feature request.
- Important sign-in controls disappear with the top header on some screens; action prompts can still open sign-in. Review signed-out navigation on a real phone so access does not depend on guessing which button to press.
- Long store names are still clipped inside native selectors. Overflow tests passing only means the page does not scroll sideways; it does not prove all labels are readable.
- The code has accessible focus work and reduced-motion handling, but a persistent focus outline may appear in captures after programmatic navigation. Keep keyboard focus visible; test touch behavior before changing it.

## Stamps, status and confidence

Three concepts need different language: **chosen take stamp**, **crowd observation confidence**, and **verified store identity**. Sauce Heretic / Certified Tender / Nope are playful opinions. UNCONFIRMED / IN STOCK / SOLD OUT / MIXED / STALE describe report agreement and freshness. VERIFIED STORE identifies an account/source. Cobalt SPONSORED identifies payment. None should confer the meaning of another.

The new local browser evidence shows one report as UNCONFIRMED and two matching people as IN STOCK. That is a pass. The independent audit also found that cached stock counts are not aged on the price page, so a once-valid IN STOCK label can remain displayed too long. This is a release correction, not a cosmetic suggestion. “Last seen” is an observation, never a guarantee that the next shopper will find it.

## Priority

Before deploying the new release: fix stale confidence display; separate product stock from place status in copy; make the primary in-store reporting action reachable; do not imply media is implemented. Before public participation: clarify opinion/verification and source freshness. Later polish: richer VS splash, warmer empty states, stronger cards and a grouped Discover destination.

## Decisions needed

Approve the direction of personality, not illustrative scores or seeded user stories. My recommendation is to keep the loud street-layer design and playful debate, while moving factual explanations into short calm labels. Choose whether the central plus stays “Drop a take” or opens a labeled Report / Take chooser. I recommend keeping its current single purpose and making Report separately prominent. Decide whether discovery gets a grouped destination rather than another bottom tab.
