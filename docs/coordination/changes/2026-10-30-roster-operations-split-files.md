# Roster split-file storage

Model: Codex. PR #19, not deployed.

Adds verified Admin conversion between a single Google operations file and immutable monthly parts. The manifest is written last, and only changed parts are replaced. All operational records and the original backup remain retained. The configured ceiling applies per part. Version hints and editor notification maintenance recognise the split layout.

No D1 activation, production configuration changes or messages. Merge is held until the owner confirms deployment of 6bb4844, the ROSTER_OPERATIONS_MAX_CHARS setting and Storage screenshot. See the task record for validation status and rollback.
