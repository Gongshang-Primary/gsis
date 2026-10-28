# GSiS v0.7.11 contracts

Write protocol stays 500. Existing authenticated authority, revision checks, stable request IDs and receipts apply.

- Contacts Roster people add authoritative role and groups metadata. Staff ID remains identity.
- System Config adds nameBridges with links and people. Admin saveNameBridge/deleteNameBridge accept timetableName and (for save) staffId; view:systemConfig returns the updated configuration projection.
- confirmStapler confirms a saved dated plan without daily publication. Legacy publishStapler is retained as a compatible confirmation command. Latest saved confirmed draft feeds allocation.
- publish accepts notifyMode all, affected or none. Daily publication stores a dated snapshot. dailyNotify reads it; notifyDaily sends that snapshot to all changed/updated teachers (including restorations) or the specified staffId.
- Daily Updates keeps the dailyEmployment API operation for compatibility. Ordinary readers receive reports without recipient settings or delivery configuration.
- Duty membership stores inclusive from/to dates. Legacy timed entries are read compatibly, with eligibility rechecked.
- Deploy exports R unchanged by Roster blocks; Roster calculates remaining entitlement against actual committed/completed relief and available periods.
- Empty annual history is a valid zero start; historical records are not silently marked empty when reads fail.

See the baseline API contracts for unchanged operations and CHANGELOG_v0.7.11.md for behaviour.
