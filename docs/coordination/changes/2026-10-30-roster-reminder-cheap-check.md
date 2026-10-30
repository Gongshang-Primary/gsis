# Published-day scheduler read reduction

Model: Codex
Status: prepared branch; full Linux CI and Claude review pending. No deployment.

The version-fenced scheduler hint now carries the earliest unqueued teacher reminder, SMC reminder or automatic daily report deadline. Published days can skip the full Google operations read before that deadline. Existing freshness, mutation, dirty-write, summary and allocation guards still force a full read when needed. Historical publication dates no longer grow the hint.

Teacher and SMC dedupe keys and acknowledgements remain authoritative. This changes no notification content or provider delivery behavior. Local focused checks and 18-component build pass. Rollback: restore the prior matched backend; old hints fail closed and rebuild.
