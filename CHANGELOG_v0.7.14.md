# GSiS v0.7.14

Baseline: GSiS v0.7.13 full deployment package. Release work was authorised on 19 October 2026, Singapore time.

## Roster exports

Assign relief has two Excel actions. **Export Excel** produces the selected day's full teacher summary in the offline Stapler Module 3 style, with Subject, Class, Venue and Group rows for each teacher. Teachers without relief assignments remain included. **Export relief excel** retains the relief arrangements workbook beside it.

## Name Bridge

Search and selection now use one field. Type part of a timetable name, then select a result. Saving still requires an exact baseline timetable name and a valid Contacts Staff ID. A typed search alone cannot create a mapping.

## Automatic allocation

Same teaching subject and same teaching level join the allocation preferences. Existing saved preference order is retained; the two new rules are appended in subject then level order. Admin can change preference order. Saved System Config remains in the operational store across ordinary code updates.

The fixed objective is valid assignments first, maximum coverage second, then the least deviation from the saved business rule priorities. The allocator compares whole arrangements and can revise tentative choices. Hard eligibility, R and employment limits, occupied periods and protected assignments remain outside the preference score.

A completed search can prove both maximum coverage and minimum deviation within the model. If the preference search reaches its bound after maximum coverage is proved, the result is identified as the best rule match found, without an optimality claim. If coverage cannot be proved within the search bound, the scheduled cycle retains the last valid draft for SMC review. Full coverage requires enough eligible capacity.

## Import Offline JSON

Roster > Stapler renames **Load legacy plan** to **Import Offline JSON**. It accepts offline Stapler Plan and Relief payloads, including the supplied v3.9 and v4.3 examples. The selected day is imported from a file that can contain both complete timetable weeks.

Teachers are matched by name and saved Name Bridge mappings. Missing or ambiguous identities require explicit Admin resolution for that import. These choices do not silently create permanent Name Bridge entries. Similar spellings do not establish identity. The saved plan retains moved and edited cards, new duties, custom classes, suspensions, Card Pit placement and assigned recess work. Missing original source fields are recovered from the embedded workbook where available. Import does not replace the baseline or publish the day. Repeat imports preserve existing card provenance. Swap assignments and incomplete or No relief absence records stop with a clear resolution message.

The five supplied examples are the acceptance fixtures. They all contain empty reliefAbsences, so those examples alone cannot establish compatibility with every Relief or Swap state. See VALIDATION.md for the checks actually completed and their limits.

## Courtyard shelter

The short transverse rail marked with the orange cross is removed. The blue marked section continues the adjacent yellow rain shelter, following the supplied viewpoint and alignment.

## Release evidence

Write protocol remains 500. This package does not install code, change production flags, publish a timetable or send a staff message. Actual validation is recorded in VALIDATION.md and RELEASE_SUMMARY.json. Historical release records remain unchanged.
