# LORD reference integration with GSiS

24 October 2026. Prepared against supplied LORD v1.8.1 and GSiS v0.8.11a plus the reviewed, uncommitted optimisation draft. This is source work, not an installed release.

## Ownership and normal use

LORD owns a durable copy of its reference directory. Booking, custody, display and identity readers pin one local snapshot per execution. They do not make a remote Contacts or Deploy request for each user action. Existing inventory, trolley, period, administration, booking and custody storage remain owned by LORD.

A scheduled sync checks two independent sources. Deploy supplies its explicitly published version identity and authoritative publication update marker. Contacts supplies a fresh digest of its minimal staff projection, including TTb name, verified school email, notification email, active state and phone number. A phone edit therefore does not wait for a Deploy publication. Contacts direct Sheet edits are covered by fresh projection reads, not an epoch-only unchanged shortcut. Contacts check time is called observedAt; it is not a fabricated edit time.

Unchanged source keys return a manifest without the directory body. Only changed sources are downloaded. LORD validates the candidate completely, stages an immutable local JSON file, and compares the starting local generation under its existing writer lock before publishing one pointer. Network work stays outside that lock. Failed or partial sync leaves the last valid snapshot intact and records failure separately. These are two independently observed source versions, not a transaction spanning both upstream services.

Integration is opt-in through explicit setup after the first successful sync. The setup installs the periodic checker. Normal reads remain local; an administrator can request an immediate check. Known failed or overdue contact verification must prevent a new WhatsApp send using an unverified recipient. Administration continues to use the existing local administrators sheet and Google identity binding.

## Identity and history

Use Contacts Staff ID, Deploy class ref, TG ID and existing subject code as identities. Class and TG namespaces are distinct. A display name or class abbreviation is not an identity. New booking commands bind the reference generation they showed; a stale generation must be refreshed before a semantic change is accepted. Preserve existing booking/session text and owner identity. A current name match must never redirect a historical booking to a different person who later acquired that name.

The live comparison found published 2026 T4 post-PSLE with 40 actual classes and unpublished 2027 Term 1 with 59. P changes Perseverance to Prudence. The published configuration already includes both naming presets, so export actual published class rows, not every preset. The 2027 draft must not become operational merely because it is newer. Published effective dates remain explicit; an out-of-range version must not silently substitute a draft.

The existing LORD classes list contains 40 form classes and 62 other teaching/activity entries. Preserve local activity options while taking published classes and TGs from GSiS. Record their local origin at initial adoption; do not reclassify a removed GSiS class as a custom activity on a later sync. Preserve user-entered activity text and historical labels where existing workflows allow them.

No staff phone or email directory belongs in the general reference response. Public selector metadata includes only the identity/name fields needed by the current UI. Phone lookup stays behind the existing authorised backend paths.

## Alternatives considered

Fetching Contacts/Deploy in every booking and identity request would provide immediate checks but add remote dependency latency to common actions. Replacing multiple local Sheet tabs creates partial-generation and unnecessary-write problems. Trusting a cache timer or the Deploy global revision cannot detect all relevant changes correctly: direct Contacts edits can bypass epochs, while unpublished planning edits unnecessarily change global Deploy revision. The chosen snapshot/version-vector approach isolates reads, maintains one complete local generation and refreshes only changed sources.

## Verification requirements

Verify unchanged reads and zero remote calls from ordinary local readers; draft edits versus publication; direct phone/role/TTb edits; expected-version mismatch; failed and concurrent sync; pointer compare-and-swap; malformed/missing/duplicate identities; active-state changes; P rename collision; stale booking forms; renamed/reused staff names; retained custom activities; private fields excluded from reference responses; stale contact send gate; integration-disabled compatibility; clean template generation and existing suite regressions.

Live provider timing, simultaneous Google execution, installed trigger operation and WhatsApp delivery require installation/UAT. No production setting, record, deployment or staff message is changed by this source work.
