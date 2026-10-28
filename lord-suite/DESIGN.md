# LORD product design

## Overview

Dense school equipment operations, with mobile-first teacher tasks and a compact desktop oversight view. Existing v1.7 components and CSS tokens are canonical. Preserve approved families A, B, C and E. Family D (STARLORD board) stays deferred.

## Colors

Source/lord/assets/styles.css and Source/overlord/assets/styles.css own the palette. Existing blue, orange, amber, red and green status meanings remain. Missing-photo declarations carry text; color is supplementary.

## Typography

Existing system font stacks remain. No downloaded fonts or new UI dependency. Teacher forms keep readable native input text and 44px controls.

## Layout

Information density is an explicit user requirement. Add one short incident line between metrics and workspace; open details on request. Teacher response pages show the cart, booking window, current status and explicit action. No decorative hero or generous whitespace.

## Elevation & Depth

Reuse existing cards and native modal treatment.

## Shapes

Reuse existing input/button radii and focus styles.

## Components

Existing showLORDDialog/confirmLORD and showManagedDialog own confirmation and modal focus. Existing form fields, loading, error/retry and submission utilities own new flows. Native select geometry is accepted. Keep the existing date picker.

Booking Class / TG / Activity and Subject use the shared `assets/reference.js` editable combobox in LORD and OVERLORD. Staff can type directly or explicitly choose a catalogue suggestion. Typed text remains custom, including when it matches a catalogue label; selecting a suggestion retains its stable identity. Keep keyboard navigation, visible focus and usable touch targets. Teacher selection remains a native select.

## Do's and Don'ts

Keep evidence status explicit. Never describe a declaration as photo-verified. No new mobile tab navigation. Preserve drafts before deep-link navigation. Use compact wrapped rows on narrow screens, not tiny touch targets.

Design review: Awesome Design provides product-density calibration; Premium owns consistency and failure states; Taste is applied as restraint within this established product; UI UX Designer checks mobile reach, labels and consequences. Runtime token ownership stays in CSS, so this document does not duplicate token values.
