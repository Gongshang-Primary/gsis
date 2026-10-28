# GSiS v0.6.04 API changes

Write protocol remains 500. Relief schema remains 3. Calculation version changes to whole-week-v3. R is floor(max(0, rawR)); unavailable remains null, and rawR retains full precision. Existing whole-week-v1/v2 saved settings are interpreted without rewriting source records. Reads of historical publications use the current calculation with their frozen inputs, as before.

Contacts deploySnapshot supplies user.palEditor for normal snapshots. A signed authority-only request can request palAuthority:true to resolve YH/Acting YH from the confirmed current Contacts record. Only KP users require this lookup; Admin is always allowed. Duplicate identities, inactive staff and AYHs do not grant YH capability. Pending Contacts changes cannot grant PAL write authority.

Deploy enforces PAL allocation permissions on saveDraft and legacy direct/batch paths. Browser capability is presentation only and is not trusted by the backend. setPAL remains Admin only. FT additions propagate PAL in the same atomic assignment save; retries are deduplicated by the existing receipts and assignment identity.

Table filtering is local presentation and does not change the general relief API's teacher scope or denominator. Existing route URLs and workbook schemas are retained.
