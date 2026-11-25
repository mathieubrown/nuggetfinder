# Nugget Court decision brief

**Proposal for review, not a rule change.** Reviewed November 25, 2026 against d0174bb. Court is a playful community classification, not a food-safety, ingredient, inventory, business-verification or legal determination.

## Recommendation

Keep seven days, 20 eligible accounts and 60% for an invited pilot, subject to your explicit decision. Do not lower the quorum simply to produce more winners. Treat low turnout and a divided jury as legitimate endings. Before public voting, define what happens when fraud or account deletion changes a closed result.

These numbers are product choices, not statistically validated measures of all shoppers' views. Twenty accounts are not proof of twenty independent humans. A 60% share in a self-selected poll is not scientific certainty.

## What the code actually does

| Topic | Current implementation | Recommendation and tradeoff |
| --- | --- | --- |
| Start | Seven days from first moderator approval, not nomination | Keep this. Moderation delay should not consume voting time. |
| End | Voting closes at the stored timestamp. No early victory, even at 100 votes | Keep fixed deadlines. Show a readable local closing time with timezone. |
| Options | Nugget / Nugget-adjacent / Absolutely not | Keep all three. Adjacent is a distinct answer, not a half-vote. |
| Quorum | At least 20 eligible accounts across all three options | Keep for pilot. Expect some cases not to reach a ruling. |
| Ruling | A unique option must receive at least 60% of all counted votes | Keep the denominator explicit. 12 of 20 qualifies; 11 of 20 does not. |
| Tie | COURT DIVIDED when quorum is met; no winning option | No moderator casting vote. A 10/10/0 split is divided. |
| Low participation | NOT ENOUGH VOTES after seven days if fewer than 20 count | Close without a ruling. Do not quietly extend or promote a winner. |
| Repeat voting | One stored answer per account per case, changeable before close, five-second cooldown | Keep changeable votes; UI should say “Change my vote,” not imply another vote. |
| Daily limit | Counts distinct recently updated case rows, not every change | Decide whether “60 per day” means cases or actions. Current implementation cannot enforce 60 individual changes. |
| Repeat nominations | Normalized food name is globally unique | No normal second round exists. Define a reviewed appeal/retrial process before promising rematches. |
| Results after close | Recomputed whenever requested; banned/deleted voters can change totals | Must decide snapshot/versioning policy. A published ruling is currently not immutable. |
| Discovery | Only final Nugget and Adjacent outcomes enter the Field Guide | Keep discovery separate from claims that a store has that food available now. |

## Examples

| Nugget | Adjacent | No | Total | After closing |
| ---: | ---: | ---: | ---: | --- |
| 19 | 0 | 0 | 19 | Not enough votes, despite unanimity |
| 12 | 5 | 3 | 20 | Nugget, exactly 60% |
| 11 | 5 | 4 | 20 | Court divided, 55% is insufficient |
| 10 | 10 | 0 | 20 | Court divided, tied |
| 8 | 7 | 5 | 20 | Court divided; plurality alone does not rule |
| 13 | 5 | 3 | 21 | Nugget; the winning integer count must reach ceiling(0.60 × total) |

Before the deadline all of these remain IN SESSION. There is no automatic extension, runoff or moderator override in the reviewed code.

## Closed-result integrity needs a decision

The independent local probe created a closed 12/5/3 result: NUGGET with 20 votes. Banning one Nugget voter changed it to NOT ENOUGH VOTES with 19 votes. No new vote was cast. Deletion can have the same effect through cascading vote removal.

Recommended future design: keep a versioned closing result, with a visible “Ruling under review” state if vote eligibility is challenged. A moderator can invalidate fraudulent votes and publish an explained new version; they cannot choose the winning side. Historical share cards should include a result date/version and should not silently contradict the current page. This is a proposed change requiring your decision, not implemented in this review.

## Abuse resistance

Already present: sign-in, age-confirmed profile, bans/temporary locks, one row per account/case, server-side deadline checks, serialized account writes, cooldown, moderated nominations, blocked-term checks, report/block controls and duplicate-name prevention. Case authors may vote too; there is no author exclusion.

Missing or unproven: protection against one person creating many accounts, coordinated creator brigades, signup/email abuse controls, vote-action accounting, account-age rules, historical result versioning and a documented moderator response process. Blocking affects who can see a nomination, so two viewers can have different visibility; it does not make blocked accounts' votes disappear from aggregate counts merely because one viewer blocked them.

Recommendation: no purchase, sentiment or points reward for voting. No device fingerprint or location history. For an invited pilot, monitor suspicious activity manually and use reversible, explained moderation. If we add account-age eligibility or automated detection later, document false positives and appeals first. Email verification alone is not proof of a unique person.

## Voice and information boundaries

Keep “Is it a nugget?”, “Court divided” and “Absolutely not.” Add a calm line on results and shares: **“Community opinion · [count] votes · closed [date].”** Never use VERIFIED or CONFIRMED to mean the food has objectively become a nugget. A winning katsu nomination does not verify allergens, recipe, nutrition, stock, price or a suggested location. All those need their own sources and timestamps.

## Decisions needed from Mat

1. Keep the proposed seven-day / 20-account / 60% pilot rules? Recommendation: yes, with no automatic extension or lower-quorum exception.
2. Close low-turnout and tied/divided cases without a winner? Recommendation: yes; let the dialogue remain fun without manufacturing certainty.
3. Use versioned results and a reviewed retrial process? Recommendation: yes. Decide who may request a retrial and what new reason is required; do not enable it silently.
4. Does the daily limit cover 60 different cases or 60 vote changes? Recommendation: explicitly separate a case cap from an action cap, then test whichever rule you approve.
5. Keep creator and author participation permitted? Recommendation: yes for opinion polls, with disclosed challenge links and no paid vote weighting.

No Court SQL, thresholds, copy or behavior was changed during this review.
