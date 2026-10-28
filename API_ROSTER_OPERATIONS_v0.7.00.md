# Roster operational API v0.7.00

The school Worker authenticates the signed-in school account, then uses the existing signed Deploy bridge envelope with action `rosterOperations`. It overwrites `calendarByDate` using the Calendar API and never accepts browser claims about identity, availability, quota or publication. Deploy gets fresh Contacts directory/SMC/Admin authority. Dates are ISO dates; display uses Singapore time. Each mutation requires UUID `requestId` and the latest integer operations `revision`.

## Input operations

| Operation | Additional input | Authority |
| --- | --- | --- |
| read | date, scope optionally mine | Own records, SMC date projection |
| availability | date | Signed-in school staff |
| candidates | date, demandIds | Own absence or SMC |
| saveAbsence | id optional, staffId optional, dates or from/to, periods, typeId, remarks, reliefRequired | Own or SMC proxy; today/future |
| deleteAbsences | ids, confirm:true | Own or SMC; today/future |
| saveInstructions | absenceId, instructions mapping lessonKey to text, instructionsNA | Own or SMC; today/future |
| saveAdhoc | date, staffId, periods, employment | SMC |
| deleteAdhoc | id | SMC |
| contactCreate | name, mobile, employment, requestId, confirmDistinct optional | SMC; forwards narrowly to Contacts |
| saveTypes | types entire ordered list | Admin |
| assign | date, demandIds, staffId, confirmOverride optional | SMC |
| noRelief | date, demandIds, reason, confirmOverride optional | SMC |
| removeAssignment | date, ids, confirmOverride optional | SMC |
| publish | date | SMC |
| requestMutual | absenceId, requests [{demandIds,recipientId}] | Owner or SMC |
| respondMutual | id, decision approve/reject, reason required for rejection | Intended recipient |
| externalLink | date, staffId | SMC; selected daily external pool |
| audit | date optional | SMC or Admin |
| prunePreview | from,to | Admin; past only |
| prune | from,to,confirm:true | Admin; past only |

`read` returns revision/date/today/user, projected people, absence types, periods, timetable teachers/cells, absences, ownAbsences, demands, assignments, mutualRequests, daily adhoc entries, myDuties, myDutyUpdates and notifications status. Ordinary users receive no other person's absence reasons, unpublished plan or mobile numbers. My duties include own published today/upcoming/past only. An invalidated or cancelled previously published duty appears in myDutyUpdates. SMC sees selected date school absences and draft plans. Each absence date is a separate record; a multi-date submission returns savedIds.

Types have id,label,allowSelectAll,allowedPeriods (null or integer array), afterMinutes/minStartMinutes (null or minute of day),todayOnly. Periods have period,start,end,startMinutes,endMinutes. Timetable cells are [subject,class,venue,group]. Demands have id,absenceId,staffId,name,date,period,timeStart,timeEnd,subject,className,venue,groupName,lessonKey,timetableId.

Assignments snapshot the demand plus staffId (covering colleague), absentId,absentName,relieverName,instructions,sourceKey,status,mutual,noRelief,remove,replaces,publishedAt. Pending drafts never replace current published duty until publish. Mutual recipient approval publishes immediately and counts in R. One person cannot cover two demands in a period. Same normalised mobile is treated as one person for timetable, absence and cover clashes. Unknown timetable prevents ordinary eligibility; unknown quota remains null and never blocks an otherwise verified free period. R is weekly, as the existing authoritative Deploy API specifies, with assigned count over the matching Monday-to-Sunday week.

All absence mutations, assignment reconciliation, audit and notification intent are committed in one operations JSON file under the existing script lock. An exact request retry returns the receipt; changed payload or actor reuse returns 409. Receipts are retained until operational storage maintenance. Current file ceiling is 12 MB.

## Service boundary

Action `rosterService` uses a separate `ROSTER_SERVICE_SECRET`, minimum 32 characters. The HMAC envelope is identical to the existing bridge. Content must include `service:'gsis-roster-notifier-v1'`, timestamp no older than 60 seconds, UUID nonce and input.operation. This signature cannot invoke school-user operations.

| Service operation | Input | Output |
| --- | --- | --- |
| claimNotifications | limit 1 to 10 | notifications rows with claimId |
| notificationResult | id,claimId,state sent/failed/uncertain,messageId,error | recorded |
| notificationDelivery | eventId,messageId,notificationId optional,recipientId,state sent/delivered/read/failed,timestamp | recorded |
| externalDuties | capability | date,duties,request or null |
| externalRespond | capability,decision,reason,calendarByDate from trusted Calendar service | recorded,status |

Capability fields are staffId,date,purpose duties/mutual,expiresAt (milliseconds),requestId for mutual. The Worker authenticates HMAC capability tokens before invoking the service. The backend binds request owner/date/state again. Access expires at most seven days from creation and no later than the day after the relevant duty date. Future dates beyond seven days require a renewed link. External approval requires a fresh authoritative Calendar result and current Contacts/timetable availability.

Outbox kinds are mutual_request, mutual_override, contact_review. Rows contain id,key,kind,recipientId,mobile,name,date,requestId,data.summary,status,createdAt,expiresAt,attempts. Status starts queued. A claim gets a two minute lease; expiry becomes uncertain and is never automatically resent. Failed and uncertain sends need reconciliation; webhook delivery can resolve an uncertain attempt by the signed delivery notificationId plus matching recipient. Delivery state never regresses from read to delivered/sent/failed. No absence reason or medical details enter message summaries.

Sending defaults disabled in the Worker. Provide the school sending number, approved templates, token, secrets and chosen Admin recipient IDs during installation. `ROSTER_NOTIFICATION_ADMIN_IDS` is a comma-separated list of stable Contacts IDs. The Contacts deployment accepts the same dedicated ROSTER_SERVICE_SECRET for its narrow rosterServiceDirectory action. No school user is impersonated. The Worker supplies the trusted notification readiness flag; browser input cannot enable sending.
