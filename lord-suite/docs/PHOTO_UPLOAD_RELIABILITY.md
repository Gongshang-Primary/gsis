# LORD photo upload reliability

Collection and return photos keep the existing browser compression and small-image upload. A durable manifest in the existing Event Log reserves one Google Drive file ID per photo before uploading. Retrying the same authenticated submission reuses those IDs. LORD checks the saved file's parent, MIME type, size, checksums and upload metadata before linking it to custody records. Uploads run outside the Sheets writer lock; the final custody write and committed manifest are one atomic Sheets batch.

## Upgrade an existing installation

1. Replace LORD Code.gs with this release's source. Keep the existing Script Properties and manifest settings.
2. In Apps Script, choose **Services → + → Drive API → v3 → Add**, with identifier `Drive`. Keep the existing Google Sheets API v4 service (`Sheets`). The supplied `appsscript.services.fragment.json` shows both declarations; merge these dependencies into an existing manifest rather than replacing its other settings.
3. If the script uses a standard Google Cloud project, also enable **Google Drive API** in that project's API Library. Apps Script's default Cloud project enables the API when the advanced service is added.
4. Run `inspectLORDPhotoUploadReadiness` as the web-app execution account and authorize Google access if prompted. Expect `status: READY`. It reads the configured `LORD_PHOTO_FOLDER_ID` folder and checks that the account can add files; it creates no file or booking.
5. Publish a new version of the existing web-app deployment. Preserve its URL, execution identity and access settings. Verify a collection and return on a nonproduction copy before operational use.

No new Script Properties, Cloudflare bindings, worksheet or header migration is required. New upload-manifest rows appear automatically in Event Log. The generated first-time manifest enables both services. Google OAuth tokens remain on the Apps Script server.

## Retries and maintenance

Keep the saved form and retry with unchanged details after an unconfirmed result. The current LORD client preserves its request ID for 24 hours and retains its compressed photo bytes for these retries. Changed content creates a different submission. Clients without a stable request ID receive an explicit reload message. If the final custody write succeeds but its separate response receipt cannot be saved, a retry normally recovers the committed record. If REIGN has already archived that record, LORD rejects safely and an administrator must inspect the saved/archive record instead of resubmitting. A photo conflict or unreadable manifest fails safely; a successful response is never inferred from a timeout or HTTP 409 alone.

A pending manifest can remain after a rejected or interrupted custody commit. `maintainLORDPhotoUploads` retires at most 20 pending manifests older than eight days per run. Run it from the editor when old pending manifests accumulate; repeat after reviewing its counts if needed. It deletes no Drive files and never changes a custody record. A retired request must start a new submission. New uploads stop with a maintenance message at 2,000 pending manifests.

REIGN preserves pending manifests and keeps completed/retired manifests for at least eight days, exceeding the seven-day server receipt lifetime. Older completed/retired manifests follow the normal REIGN archival rules. Evidence files remain in Drive, including unlinked files from abandoned submissions; inspect authoritative custody records and archive references before any manual deletion. This release does not automatically delete evidence files.

The transport is a small-image upload with deterministic retry recovery, not a chunk-resumable uploader. Existing image compression remains the primary payload reduction. The server accepts JPEG, PNG and WebP, up to 5 MB per image and 12 photos per submission.

## Google reference

- [Apps Script Advanced Drive service](https://developers.google.com/apps-script/advanced/drive)
- [Enable advanced services and Cloud APIs](https://developers.google.com/apps-script/guides/services/advanced)
- [Drive uploads and pre-generated file IDs](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- [Drive file metadata and checksums](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)
