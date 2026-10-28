# GSiS v0.4.16 rendering and performance

Balanced graphics retains instancing and antialiasing, adds one selective 1024 px directional soft-shadow map, warmer sun/cooler sky fill and low-specular metal roofs. Only opaque upper batched structures and the Hall roof cast shadows; glazing, plants, railings and labels do not add shadow passes. The shadow map updates when visibility/quality changes, and is reused while the camera moves. Lighter disables shadows and reduces render density.

Pixel ratio caps: Balanced 1.25 and approximately 2.1 million render pixels; Lighter 1.0 and 1.4 million. Showcase uses elapsed frame time and schedules frames only while active. If over 60% of 120 sampled frame intervals exceed 50 ms, Balanced reduces optional effects. Short stalls and intervals over 250 ms do not count as sustained-performance samples. An explicit quality selection persists; automatic fallback does not change the saved preference.

Mouse deadzone: 12 CSS px displacement within 650 ms, with 400 ms allowance after starting. Deliberate drag/touch/wheel bypasses the deadzone. On pause the tour hands over its current target/distance/orbit angles and returns to idle rendering. Hidden tabs/focus loss pause and require explicit restart.

Verification uses local Chromium with software WebGL and synthetic/offline data. It establishes rendering, controls and fallback behavior, not Intel/Apple/mobile frame rates. Baseline Windows i5-8000 integrated-GPU performance, sustained tour usability, actual screen size/browser acceleration and separate mobile/Apple checks remain operational acceptance items. No live latency or exact FPS is claimed.
