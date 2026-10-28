# Remaining checks after v0.7.16

The release implements queue items 009 through 017 and follows up suspended-plan items 007 and 008. The authoritative history is GSiS_Queued_Changelog.md.

1. Verify Save, refresh, Confirm and reopen against the installed school Drive store using the matching Deploy backend and Roster frontend. The earlier production failure was not observed directly during this local build.
2. Measure actual suspension loading after the first successful legacy-plan Save or Confirm stores validation metadata. Local timings are not production guarantees.
3. Complete and verify WhatsApp Inbox production configuration, signed incoming webhook and scheduled reply path under the school's authorised test procedure.
4. Nonempty offline reliefAbsences, including saved absence decisions and swaps, remain outside the final-timetable importer. The five supplied JSON files do not contain those decisions.
