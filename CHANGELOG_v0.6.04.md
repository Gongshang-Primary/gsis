# GSiS v0.6.04

Individual relief R now rounds down after clamping to zero. The PDF workload formula and intermediate precision remain unchanged. The calculation identifier is whole-week-v3; schema 3 and read compatibility with earlier saved rules remain. This also invalidates cached fractional results.

PAL in Auto mode adds each newly assigned P1/P2 FT teacher once. Replacing A with B retains A and adds B. Removing FT does not remove PAL. Manual PAL removals survive refresh and unrelated saves. Turning Auto on initially adds current P1/P2 FTs; repeated saves in Auto do not reseed removed allocations.

YHs, including Acting YHs, and Admin may edit PAL in either mode. Other SMC may edit PAL only in Manual mode. Contacts supplies the current user's YH capability; planning profile edits cannot grant it. Only Admin changes the PAL mode. PAL additions and FT changes use the same existing atomic save.

Relief Settings shows active teaching staff only, excluding OSO, SAT, support staff, SLs and MK staff. Zero-R teachers remain. The compact table has frozen headers and first column, combined partial text filters for every column, centred numerical values and LaTeX variable headings. Ti and Wi are adjacent. Weekly budget and timetable factor are removed from table columns but remain calculation inputs. Excel export follows the displayed table scope.

No Roster feature is implemented in this release. No live deployment or staff data was changed during preparation.
