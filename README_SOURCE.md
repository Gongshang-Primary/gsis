# GSiS 0.9.9 full suite

Start with the [existing-school setup guide](docs/v099/SETUP.html). This release harmonises all 18 production components and includes a separate administrator-only timetable preparation package. Keep existing deployment destinations, settings, bindings and credentials.

**Production Roster remains Google-first.** Its parallel Worker development is documented stage by stage; this release does not activate a relief ledger or transfer timetable/operation authority. Calendar also retains its Google source.

Calendar preserves its table position and open drafts, uses a quieter yellow status indicator and adds safe administrator venue diagnostics. Optional change notifications reuse the existing Calendar jobs service and dedicated D1. Removing idle browser polling requires the separately documented push setup and explicit enablement; default-off retains existing background checks. Keep `CALENDAR_SYNC_CONTINUE=false`.

- [Changes](CHANGELOG_v0.9.9.md)
- [Verification and limits](VALIDATION_v0.9.9.md)
- [Developer handover](docs/v099/HANDOVER.md)
- [Requirements and remaining operator checks](docs/v099/REQUIREMENTS_STATUS.md)
- [Roster Worker roadmap and future changelog requirements](docs/v099/ROSTER_WORKER_ROADMAP.md)
- [Source review and recovery](docs/v099/SOURCE_REVIEW.md)
- [Timetable preparation status](docs/v099/TIMETABLE_HANDOVER_STATUS.md)
- [Calendar venue lookup diagnostics](docs/v099/VENUE_LOOKUP.md)

The review archive retains current source, tests, required comparison fixtures, build tools, concise history and a Q-to-0.9.9 patch. Its inclusion/omission index records pruned delivery material; packaging deletes no live records or Git history. Known private configuration and historical live-observation dumps are excluded. Some inherited test fixtures retain historical names. A build or local test is not a deployment or proof of a live provider outcome.
