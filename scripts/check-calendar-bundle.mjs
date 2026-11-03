#!/usr/bin/env node
// check-calendar-bundle.mjs -- read-only Calendar bundle version check.
//
// Usage: node scripts/check-calendar-bundle.mjs <bundle-folder>
//
// The folder is the Calendar bundle folder itself, for example the
// calendar-row9-together folder of a deploy branch, or the parent
// deploy-bundle folder (the calendar-row9-together subfolder is then used).
// It accepts the names used in both places:
//   backend: Calendar_Backend_v0.9.9.gs, or C1_Calendar_Backend.gs
//   frontend: Calendar_Frontend_v0.9.9.zip, or C3_Calendar_Frontend.zip
//   job Worker: dashboard-worker.txt, or C2_gsis-calendar-jobs_worker.js
//
// What it checks, and what it does not claim:
//   - Product version, from markers that are actually in the files:
//       backend:  RELEASE_VERSION in the .gs file
//       frontend: FRONTEND_VERSION in app.js inside the .zip
//       worker:   "Calendar Job Worker release X" in the Worker header
//     All three must be equal. The frontend index.html release label
//     (for example v0.9.9i) and a LABEL.txt build label (for example
//     0.9.9i, the package.json gsisBuildLabel) are reported separately:
//     they are a deploy iteration, not the product version, so a trailing
//     letter on them does not by itself make the bundle a mismatch.
//     If more than one build label is present, they must agree.
//   - Protocol markers the other pieces expect from the backend:
//       frontend: the backend response version must equal FRONTEND_VERSION
//         (app.js throws "Frontend/backend version mismatch" otherwise).
//       worker:   the backend must provide the services the Worker calls:
//         gsis-calendar-command-v1 / calendarCommand with purpose
//         calendar-mutation-job-v1, gsis-calendar-sync-worker-v1 /
//         calendarSyncContinue, and calendarChangesAuthorize.
//     Missing markers are reported as mismatch reasons, not as passes.
//   - SHA-256 of each file, so the checked files can be compared with a
//     bundle SHA256SUMS.txt if one is supplied separately.
// No gsisBuildLabel stamp is claimed to live inside the .gs, .zip or
// Worker files, because it does not: it lives in package.json and in
// the bundle LABEL.txt / frontend release label. This script reports
// what is actually in the three files.
//
// Read-only: it never contacts Google, Cloudflare or any network, and
// it never writes, moves or edits any file. It only reads the folder
// given on the command line.
//
// Exit codes: 0 = MATCH, 1 = MISMATCH, 2 = usage error.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';

const WORKER_SERVICES = [
  'gsis-calendar-command-v1',
  'calendar-mutation-job-v1',
  'gsis-calendar-sync-worker-v1',
  'calendarSyncContinue',
  'calendarChangesAuthorize',
];

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function firstGroup(text, pattern) {
  const m = text.match(pattern);
  return m ? m[1] : null;
}

// Minimal ZIP reader: stored and deflated entries only, no dependencies.
// Returns a Map of entry name -> Buffer, or throws with a clear reason.
function readZip(buffer) {
  const END = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === END) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a ZIP archive (no end-of-central-directory record)');
  const total = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let n = 0; n < total; n++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('unsupported ZIP central directory entry');
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLen);
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`unsupported ZIP local header for ${name}`);
    }
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = buffer.subarray(start, start + compressedSize);
    let data;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed);
    else throw new Error(`unsupported ZIP compression method ${method} for ${name}`);
    out.set(name, data);
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function classify(files) {
  const found = { backend: null, frontend: null, worker: null };
  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.gs') && !found.backend) found.backend = file;
    else if (lower.endsWith('.zip') && !found.frontend) found.frontend = file;
    else if ((lower.endsWith('.txt') || lower.endsWith('.js')) && lower.includes('worker') && !found.worker) found.worker = file;
  }
  // A Worker named without "worker" (for example a bare .txt) is only
  // accepted if it carries the Calendar Job Worker header, checked below.
  return found;
}

function main(argv) {
  if (argv.length !== 1) {
    console.error('Usage: node scripts/check-calendar-bundle.mjs <bundle-folder>');
    return 2;
  }
  let folder = path.resolve(argv[0]);
  let stat;
  try { stat = statSync(folder); } catch {
    console.error(`MISMATCH: folder not found: ${argv[0]}`);
    return 1;
  }
  if (!stat.isDirectory()) {
    console.error(`MISMATCH: not a folder: ${argv[0]}`);
    return 1;
  }
  // Accept the parent deploy-bundle folder as well as the bundle folder.
  let entries = readdirSync(folder, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => ({ name: e.name, full: path.join(folder, e.name) }));
  let found = classify(entries);
  let labelFile = entries.find((e) => e.name === 'LABEL.txt') || null;
  if (!found.backend || !found.frontend || !found.worker) {
    const sub = path.join(folder, 'calendar-row9-together');
    try {
      if (statSync(sub).isDirectory()) {
        const subEntries = readdirSync(sub, { withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => ({ name: e.name, full: path.join(sub, e.name) }));
        const subFound = classify(subEntries);
        if (subFound.backend && subFound.frontend && subFound.worker) {
          folder = sub;
          found = subFound;
          entries = subEntries;
        }
      }
    } catch { /* not a parent folder; keep the original folder */ }
  }

  const reasons = [];
  const report = {};

  // Backend
  if (!found.backend) {
    reasons.push('backend: no .gs file found in the folder');
  } else {
    const data = readFileSync(found.backend.full);
    const text = data.toString('utf8');
    const version = firstGroup(text, /RELEASE_VERSION:\s*['"]([^'"]+)['"]/);
    report.backend = { file: found.backend.name, version, sha256: sha256(data) };
    if (!version) reasons.push(`backend: no RELEASE_VERSION marker in ${found.backend.name}`);
    const missingServices = WORKER_SERVICES.filter((s) => !text.includes(s));
    report.backend.missingWorkerServices = missingServices;
    if (missingServices.length) {
      reasons.push(`backend: missing Worker protocol markers: ${missingServices.join(', ')}`);
    }
  }

  // Frontend (inside the zip)
  let frontendText = '';
  if (!found.frontend) {
    reasons.push('frontend: no .zip file found in the folder');
  } else {
    const data = readFileSync(found.frontend.full);
    report.frontend = { file: found.frontend.name, sha256: sha256(data) };
    let zip;
    try { zip = readZip(data); } catch (e) {
      reasons.push(`frontend: cannot read ${found.frontend.name} as a ZIP: ${e.message}`);
    }
    if (zip) {
      const appJs = zip.get('app.js');
      if (!appJs) reasons.push(`frontend: no app.js inside ${found.frontend.name}`);
      else {
        frontendText = appJs.toString('utf8');
        const version = firstGroup(frontendText, /FRONTEND_VERSION\s*=\s*['"]([^'"]+)['"]/);
        report.frontend.version = version;
        if (!version) reasons.push(`frontend: no FRONTEND_VERSION marker in app.js inside ${found.frontend.name}`);
        if (!frontendText.includes('Frontend/backend version mismatch')) {
          reasons.push('frontend: app.js does not state the frontend/backend version check');
        }
      }
      const indexHtml = zip.get('index.html');
      if (indexHtml) {
        const label = firstGroup(indexHtml.toString('utf8'), /class="release-label">v?([^<]+)</);
        if (label) report.frontend.releaseLabel = label.trim();
      }
      const pagesWorker = zip.get('_worker.js');
      if (pagesWorker) {
        const pagesVersion = firstGroup(pagesWorker.toString('utf8'), /WORKER_VERSION\s*=\s*['"]([^'"]+)['"]/);
        if (pagesVersion) report.frontend.pagesWorkerVersion = pagesVersion;
      }
    }
  }

  // Job Worker
  if (!found.worker) {
    // Fall back to any .txt file carrying the Job Worker header.
    const candidate = entries.find((e) => {
      if (!e.name.toLowerCase().endsWith('.txt')) return false;
      try { return readFileSync(e.full, 'utf8').includes('Calendar Job Worker'); } catch { return false; }
    });
    if (candidate) found.worker = candidate;
  }
  if (!found.worker) {
    reasons.push('job worker: no Worker .txt or .js file found in the folder');
  } else {
    const data = readFileSync(found.worker.full);
    const text = data.toString('utf8');
    const version = firstGroup(text, /Calendar Job Worker release\s+([0-9][0-9A-Za-z.]*)/);
    report.worker = { file: found.worker.name, version, sha256: sha256(data) };
    if (!version) reasons.push(`job worker: no "Calendar Job Worker release" header in ${found.worker.name}`);
    if (!text.includes('calendar-mutation-job-v1') || !text.includes('gsis-calendar-command-v1')) {
      reasons.push(`job worker: ${found.worker.name} does not call the backend command service`);
    }
  }

  // Build labels, reported separately from the product version.
  const buildLabels = [];
  if (report.frontend?.releaseLabel) buildLabels.push(`frontend release label ${report.frontend.releaseLabel}`);
  if (labelFile) {
    try {
      const label = readFileSync(labelFile.full, 'utf8').trim();
      if (label) buildLabels.push(`LABEL.txt ${label}`);
      report.buildLabelFile = { file: labelFile.name, label };
    } catch { /* label unreadable; already reported through the folder listing */ }
  }
  const labelValues = [...new Set(buildLabels.map((s) => s.replace(/^.* /, '').replace(/^v/, '')))];
  if (labelValues.length > 1) {
    reasons.push(`build label: conflicting labels: ${buildLabels.join(', ')}`);
  }

  // Product version equality.
  const versions = [
    ['backend', report.backend?.version],
    ['frontend', report.frontend?.version],
    ['job worker', report.worker?.version],
  ].filter(([, v]) => v);
  const distinct = [...new Set(versions.map(([, v]) => v))];
  if (versions.length === 3 && distinct.length !== 1) {
    reasons.push(`product version: backend ${report.backend.version}, frontend ${report.frontend.version}, job worker ${report.worker.version} do not match`);
  }
  if (versions.length < 3) {
    reasons.push('product version: cannot compare all three pieces because a version marker is missing (see above)');
  }
  // Pages worker inside the frontend zip, when present, must also match.
  if (report.frontend?.pagesWorkerVersion && report.frontend.version && report.frontend.pagesWorkerVersion !== report.frontend.version) {
    reasons.push(`frontend: Pages worker version ${report.frontend.pagesWorkerVersion} does not match frontend version ${report.frontend.version}`);
  }

  // Report, then the verdict.
  for (const key of ['backend', 'frontend', 'worker']) {
    const r = report[key];
    if (!r) continue;
    const parts = [`${key}: ${r.file}`, r.version ? `version=${r.version}` : 'version=missing', `sha256=${r.sha256}`];
    if (r.releaseLabel) parts.push(`release-label=${r.releaseLabel}`);
    if (r.pagesWorkerVersion) parts.push(`pages-worker-version=${r.pagesWorkerVersion}`);
    console.log(parts.join(' '));
  }
  if (report.buildLabelFile) console.log(`build label: ${report.buildLabelFile.file} ${report.buildLabelFile.label}`);
  console.log(`protocol: frontend expects backend version = frontend version; job worker expects backend services: ${WORKER_SERVICES.join(', ')}`);
  if (reasons.length) {
    console.log('MISMATCH');
    for (const reason of reasons) console.log(`- ${reason}`);
    return 1;
  }
  console.log(`MATCH: backend, frontend and job worker are all product version ${distinct[0]}`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
