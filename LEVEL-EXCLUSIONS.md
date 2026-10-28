# Level Exclusions — v0.3.13

Version-specific advisory restrictions apply across all subjects, FT and TG at a level. Warnings never prevent selecting, saving or publishing assignments and never subtract workload. The page explains that exclusions are usually for teachers with children or relatives in school; no reason is collected.

KP/Admin see a flat active-teacher matrix with frozen header and cross toggles. SL, MK, Support Staff, SAT and OSO are filtered out. Partial teacher-name search runs locally and retains unsaved selections on hidden rows.

Each toggle stages `setExclusionCell` in the local queue. **Save changes** sends one `change / saveDraft` batch with stable request ID, expected values and edits. No request or lease is sent when toggling. The server validates roles, applies changes under its lock and returns an authorized snapshot. Same-field conflicts use the latest server-accepted save and report the overwritten user/value/location; unrelated edits remain intact.

Unconfirmed submissions retain their original save ID for retry and freeze further editing until resolved. Definitively rejected drafts can be corrected. Audit entries record changed values. Ordinary users and public exports do not receive the exclusion configuration. Older per-cell routes remain for backward compatibility but are not called by this UI.
