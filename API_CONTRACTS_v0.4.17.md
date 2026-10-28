# GSiS v0.4.17 API contracts

No API, permission, authentication, data schema or write-protocol change. Deploy protocol 415 remains compatible with the previous release. Signature settings continue using the existing Admin-only endpoint and stored subject catalogue.

The local signature renderer copies the same-origin final-size PNG at its native 1000 × 200 dimensions, then draws personal text using the supplied Outfit fonts. `signature-assets/template.png?v=0.4.17` separates the new artwork from older browser cache entries. PNG download stays local; no signature-generation upload or backend write is introduced.

The setup guide is static frontend content and same-origin screenshots. It does not access Outlook, Gmail or Google Drive accounts programmatically.
