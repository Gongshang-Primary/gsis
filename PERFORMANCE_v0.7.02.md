# GSiS v0.7.02 performance checks

The full staff baseline is fetched in the background after the Home page appears. One current model is shared across timetable and personal-duty overlays. It is replaced on a baseline change and cleared on logout. Calendar context expires separately, so a school-day or odd/even correction can refresh without replacing the model. The existing object-keyed export index is reused rather than rebuilt per view.

Check Availability reads active staff plus external staff activated for the selected date without constructing timetable, Calendar or relief quota context. Selected-teacher availability still uses fresh server decisions. Assign Relief receives a fresh one-day projection, not the whole odd/even baseline. Server authority is preserved for every mutation.

The Daily Relief Assignments tab is a read-only projection and does not open the allocation workspace or ask for allocation health merely to display saved duties. Loaded search, sorting and tab views operate locally. Appropriate background updates retain useful content without replacing an in-progress form.

The 702 regression and browser evidence in verification records actual local checks. Browser scenarios use synthetic staff and intercepted APIs. These results do not establish production Apps Script latency, school network performance or WhatsApp delivery time. Baseline measurements remain in PERFORMANCE_v0.7.01.md and are not relabelled as new measurements.
