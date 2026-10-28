# Performance and reliability v0.6.06

Ponytail: reuse the existing Calendar project, proxy authentication, year index reads, batched Sheets helpers and test harness. No new dependency, storage table, trigger, migration or cross-project write.

The date API reads Years plus the selected year's Events and YearStructure. It does not read DayNotes, staff directory or bootstrap settings. No cache is introduced. Roster and Calendar requests run concurrently; Calendar has a 12-second timeout. A failed Calendar response leaves the valid timetable available with explicit unknown parity. Existing minute polling remains.

pstack verification: inherited Calendar backend and Sheets API suites, actual Calendar doPost authentication, date policy, Roster gateway through Calendar doPost, and real DOM availability filtering. Synthetic service tests prove request behavior and zero writes, not production Google latency or permissions.
