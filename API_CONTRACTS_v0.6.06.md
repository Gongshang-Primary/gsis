# API contracts v0.6.06

Existing GSiS write protocol 500 and relief schema 3 remain unchanged. Roster storage actions are unchanged from 0.6.05.

Calendar's existing POST envelope accepts action `rosterDate`, payload `{date: YYYY-MM-DD}`, verified actor `{email,sub,userAlias}`, requestId and the existing proxySecret. The existing secret and school-identity validation runs first. Invalid dates fail. Only a unique released, non-archived Years record grants a date read.

The existing `{ok,result}` response contains version, date, term, schoolWeek, parity (`odd`, `even` or null), schoolDay (true, false or null), reason, warning and checkedAt. No event rows or person records are returned. Positive TERM_WEEK numbers determine parity. Week zero, overlap and missing structure return null parity. Published ALL_DAY/MULTI_DAY `hol` events, VACATION structures and weekends supply no-school reasons.

Roster's `/api/read` result gains `data.calendar`. `available:true` adds the date context; `available:false` contains a safe message. A Calendar failure does not fail a successful timetable read. Invalid Calendar response dates/parity/schoolDay are rejected. The verified Roster identity is forwarded server-to-server; the browser cannot supply Calendar credentials or override that identity.

Calendar's public doGet/bootstrap version is 0.6.06; schemaVersion remains v2 RC1.9. Existing workbook APP_VERSION is not changed. Calendar's mutation API and browser core remain unchanged.
