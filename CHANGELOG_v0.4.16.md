# GSiS v0.4.16

Authorized by “skip signature changes for one version, commit 3D model changes first”. Prepared release; no live installation or publication.

- Q101: Showcase button starts a 104-second exterior tour: campus overview and perimeter, Hall roof, Outdoor Experiential Garden and surrounding academic blocks, returning to overview. Camera positions and zoom vary smoothly along a preset spline.
- Mouse displacement of 12 CSS pixels within 650 ms hands over the current view, with a 400 ms start allowance. Jitter is tolerated. Pointer/touch drag, wheel, navigation controls, focus loss and tab hiding also pause. The camera uses the same orbit state as manual control and stays paused until Showcase is explicitly started again.
- Q102: Balanced graphics adds selective soft shadows, directional/sky lighting and restrained roof highlights. Lighter graphics removes optional shadows and reduces resolution; sustained slow tour frames enable it automatically. Shadows are reused during camera motion and the model returns to on-demand rendering when idle.
- Geometry, venue/teaching allocations, workload maths and backend operations are retained. Suite labels advance to v0.4.16; the Deploy write protocol remains 415.
- Signature setup instructions (Q100) and the supplied native-size 1000 × 200 PNG update (Q103) are deferred in the separate Contacts draft. This release retains the v0.4.15 signature generator.

Local software-rendered verification does not establish frame rates on the school’s Intel integrated graphics. Test the prepared Layout frontend on the baseline Windows device after installation and use Lighter if needed.
