# GSiS v0.6.01 performance notes

No production speed claim is made. Existing surgical writes, journals, durable receipts, relief caching and the 45 second complete public Layout cache remain.

Required membership derivation uses the already loaded role and appointment fields and adds no remote reads. Contacts cache namespaces change once to discard pre-fix membership projections.

Gateway response validation reads the response body once. Classification runs only on invalid responses and adds no retry or diagnostic network request to normal page loading. diagnoseLayout601 is an explicit editor-only check; it reads the current snapshot and makes one signed request to the script's existing published endpoint. It is not called during normal page loads.

Local tests establish behavior only. Live endpoint and school-device validation remain required, especially for the unresolved Apps Script response incident.
