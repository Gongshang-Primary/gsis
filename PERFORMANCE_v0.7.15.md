# v0.7.15 performance evidence

Measurements are local comparisons of the exact v0.7.14a and v0.7.15 functions under the same synthetic delays. They are not production Google service timings.

| Measure | v0.7.14a | v0.7.15 |
| --- | ---: | ---: |
| Properties service calls for 50 visible dates |67|1|
| Date list projection with 10 ms simulated service latency |719.9ms|19.0ms|
| First timetable paint in Chromium, median of 3 runs |944.4ms|270.7ms|
| Editing available in Chromium, median of 3 runs |898.5ms|880.2ms|

The date list fixture has 40 saved dates, 10 active unsaved dates, 5 expired unsaved dates and 1 unapproved date. The unchanged permissions and displayed locks are compared directly. Each service call deliberately costs 10 ms. One fresh snapshot removes repeated reads without caching a response.

The browser fixture has 104 teachers, 35 classes and 676 tiles. It simulates 120 ms for the timetable read and 600 ms for the lock request. Showing the fresh timetable before lock acquisition advances first paint; it does not remove the lock wait before editing. CPU and paint scheduling vary, so service call count and state assertions are the stable evidence.

The existing allocator timing test exceeded its 8 second local budget in the parallel regression run. Its exhaustive correctness oracle passed. An isolated rerun passed at 6161.8 ms without changing code or raising the budget. This release does not change the allocator or claim improved allocation speed.

Reproduction commands, individual browser runs and fixtures are recorded in verification/715-stapler-performance.json. No production timing, capacity or service guarantee is inferred from these results.
