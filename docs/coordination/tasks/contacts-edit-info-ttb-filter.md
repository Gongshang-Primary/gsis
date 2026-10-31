# contacts-edit-info-ttb-filter: Contacts: Edit Info filter by part of the TTb name

- Status: merged
- Owner/model: Gemini
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 2026-10-31
- Branch: gemini/contacts-edit-info-ttb-filter-6429114001216377684
- Base SHA: 8f3cccc261320aaa0219cebc0d0ba61f540904ce
- Current head SHA: 9e60c653985348d12d9689dbe35d045806ecb1e4
- PR:
- User-authorised scope: Lane C (Contacts). Contacts: Edit Info filter by part of the TTb name
- Files/domains owned: contacts-update/public/app.js, contacts-update/public/index.html, tests/contacts-edit-info-filter.cjs
- Out of scope: Any other lanes or files.
- Acceptance checks:
  - a "Find by TTb name" box in the Edit Info toolbar
  - case-insensitive, partial match on TTb Name
  - it only hides rows: edits in hidden rows are kept and saved; Save, Reload, Recalculate and "+ row" act on all rows
  - show "Showing N of M staff"; Esc clears the box

## Decisions and changes
Added `ttbFilter` input box to `index.html`.
Modified `renderData` in `app.js` to filter the rows passed to `renderStaffGrid` based on the value in `ttbFilter`.
Added event listeners for input and Esc key on `ttbFilter` in `app.js`.
Updated `renderData` and the new `renderDataStatus` to correctly display the "Showing N of M staff" message when the filter is active.
Cleared filter input when "+ row" is clicked to make the new row visible.

## Verification
`TZ=Asia/Singapore node tests/contacts-edit-info-filter.cjs`
`TZ=Asia/Singapore npm run build`

## Review
Claude will review.

## Deployment
Not deployed.

## Handoff
None.
