# Venues product design

## Overview

Venues is a dense school operations tool for adult staff. Its visual language comes from the existing LORD suite: navy task controls, rounded white panels, readable system typography, and colour used for operational status. The timetable and green Now line are the organising feature. The first task is selecting a room and periods, not reading an introduction.

The implementation uses native HTML, CSS and JavaScript. No new framework, downloaded font or decorative animation is introduced. The reviewed product design and `../docs/contracts/venues-v1.md` own business rules.

## Colors

`public/styles.css :root` is the canonical runtime token owner (Model B). It reuses LORD's ink `#152238`, navy `#183153`, deep navy `#10243f`, surface `#ffffff`, background `#f4f7fb`, line `#d8e0ea`, success `#1f7a4d` and danger `#a63c3c`. Muted text is darker than LORD's original small text to maintain legibility. Status always includes text. Navy marks selection, green marks confirmed success and Now, amber marks pending approval, and red marks conflicts and consequential actions.

## Typography

Use the installed system sans serif stack; no font request delays first render. Desktop body is 15px with a 1.45 line height. Native form controls remain at least 15px. Period timings use tabular presentation and stay readable on phones instead of compressing the entire day. Heading hierarchy uses weight and restrained size changes, not marketing display type.

## Layout

Desktop uses the full available width, capped at 1760px. A sticky room column and period header surround a bounded timetable scroller. A 320px booking form sits beside it at laptop widths; at narrower widths it moves below. The page itself retains document scrolling. The grid owns only its horizontal and bounded vertical scroll.

Phone targets are 390 × 844 and 360 × 800. Period buttons remain at least 44px and the grid scrolls horizontally. Agenda records become two-column cards with shared note/actions below. Header actions wrap. Administrative forms remain fully scrollable. Room search searches descriptors but the chosen value is a unit only.

## Elevation & Depth

White panels use a quiet border and small shadow. Dialogs use the native top layer with a scrim, bounded scrolling and persistent action row. No layered glass effect obscures timetable state.

## Shapes

Panel radius follows LORD at 18px, reduced to 14px on phones. Controls use 10px radii. Booking cells use 7px corners to preserve dense row geometry.

## Components

Runtime mapping: palette and radius live in `styles.css :root`; shared buttons, statuses, cards, grids, selector and dialog consume those variables. `app.js` owns one reusable room selector, one dialog, one persistent status area and one booking-row renderer. All screens share those owners.

The selector follows Deploy IP Deploy's established partial-word matching and keyboard pattern. Native date and ordinary policy selects accept platform-owned popup geometry. Room search is authored because descriptor-to-unit behaviour is required. Notes preserve spaces/newlines and render escaped as text.

Awesome Design was used for scheduling-interface calibration, with its Cal reference explicitly treated as a marketing study rather than a product specification. Premium provides production states and consistency; Taste provides restraint within the established identity; UI UX Designer provides target/label checks; Apple Design provides immediate feedback and reduced-motion behaviour. Existing LORD conventions override unrelated visual defaults.

## Do's and Don'ts

Show a booking as saved only after a server response. Keep an uncertain command's request ID for safe retry. Keep stale verified timetables readable and block admission while source status is pending, stale or unavailable. Close room suggestions synchronously; never wait for timetable requests. Keep preparation requests intact on failed writes. Do not put contact data, notes, roles or tokens into dashboard links. Do not hide scrollbars. Do not use browser alert/confirm/prompt.
