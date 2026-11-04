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
// Why product version alone is not enough (fix for the v0.9.9f/v0.9.9i case):
//   Product version 0.9.9 is shared by every 0.9.9 build, so a v0.9.9f
//   frontend and a v0.9.9i backend/Worker all report version 0.9.9 and
//   would falsely MATCH on product version alone. The build identity is
//   the release build label, not the product version:
//     frontend: the index.html release label (v0.9.9i, v0.9.9f, ...) and
//       the ?v= asset versions in index.html, which is the frontend
//       stamp of the package.json gsisBuildLabel;
//     backend: a gsisBuildLabel / RELEASE_LABEL / BUILD_LABEL marker, or
//       a versioned filename carrying a trailing build letter, if present;
//     job Worker: the same, if present;
//     bundle: LABEL.txt in the bundle folder or its parent, which is the
//       gsisBuildLabel for the whole bundle.
//   MATCH now requires a build-label anchor: at least one build label
//   besides the frontend label must be present, and every present build
//   label must agree. If the frontend carries a build label but no other
//   piece and no LABEL.txt carries one to compare it against, the result
//   is MISMATCH, with that reason, not a false MATCH.
//   If a SHA256SUMS.txt is present in the folder or its parent, each
//   piece's SHA-256 is also compared with its entry there; a differing
//   hash is a MISMATCH. A missing entry alone is not a MISMATCH, because
//   a sums file may use different filenames for the same piece.
//   Backend and Worker files in current builds carry no build label and
//   no Source SHA256 header inside the file; that absence is reported,
//   and the bundle LABEL.txt / SHA256SUMS.txt is then the anchor. If a
//   piece does carry a Source SHA256 header, it is reported.
//
// Protocol markers the frontend expects from the backend, checked here:
//   - backend bootstrap fields: actor, years, selectedYear, events,
//     dayNotes, yearStructure, and a version field equal to the backend
//     RELEASE_VERSION (frontend app.js throws "Frontend/backend version
//     mismatch" otherwise);
//   - job Worker services the backend must provide:
//     gsis-calendar-command-v1 / calendarCommand with purpose
//     calendar-mutation-job-v1, gsis-calendar-sync-worker-v1 /
//     calendarSyncContinue, and calendarChangesAuthorize;
//   - frontend job actions the Worker must accept: saveEvent,
//     deleteEvent, saveParentSide, relocateEvent.
// Missing markers are MISMATCH reasons, not passes.
//
// Read-only: it never contacts Google, Cloudflare or any network, and
// it never writes, moves or edits any file. It only reads the folder
// given on the command line, its calendar-row9-together subfolder if
// needed, and LABEL.txt / SHA256SUMS.txt in that folder or its parent.
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

// Bootstrap fields the frontend requires from a backend response.
// See frontend app.js validateBootstrap: actor, years, version, and the
// per-year fields checked for events, dayNotes and yearStructure.
const FRONTEND_BOOTSTRAP_FIELDS = [
  'actor',
  'years',
  'selectedYear',
  'events',
  'dayNotes',
  'yearStructure',
];

const FRONTEND_JOB_ACTIONS = [
  'saveEvent',
  'deleteEvent',
  'saveParentSide',
  'relocateEvent',
];

function normalizeLabel(value) {
  return String(value).trim().replace(/^v/, '');
}

// A build label is a product version with a trailing build letter, or an
// explicit label marker. Plain "0.9.9" alone is a product version, not a
// build label, and is not used as one.
function extractBuildLabel(text, filename) {
  const explicit = firstGroup(text, /(?:gsisBuildLabel|RELEASE_LABEL|BUILD_LABEL)\s*[:=]\s*['"]?([0-9]+\.[0-9]+\.[0-9]+[a-z]?)['"]?/);
  if (explicit) return explicit;
  const header = firstGroup(text, /Calendar Job Worker release\s+(0\.[0-9]+\.[0-9]+[a-z])/);
  if (header) return header;
  const fromName = firstGroup(filename || '', /v(0\.[0-9]+\.[0-9]+[a-z])\./);
  if (fromName) return fromName;
  return null;
}

function extractSourceSha(text) {
  return firstGroup(text, /Source SHA-?256:\s*([a-f0-9]{64})/i);
}


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

function listFiles(folder) {
  try {
    return readdirSync(folder, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => ({ name: e.name, full: path.join(folder, e.name) }));
  } catch { return []; }
}

function findAnchor(folder, filename) {
  const candidates = [folder, path.dirname(folder)];
  for (const dir of candidates) {
    const found = listFiles(dir).find((e) => e.name === filename);
    if (found) return found;
  }
  return null;
}

function main(argv) {
  if (argv.length !== 1) {
    console.error('Usage: node scripts/check-calendar-bundle.mjs <bundle-folder>');
    return 2;
  }
  const given = path.resolve(argv[0]);
  let stat;
  try { stat = statSync(given); } catch {
    console.error(`MISMATCH: folder not found: ${argv[0]}`);
    return 1;
  }
  if (!stat.isDirectory()) {
    console.error(`MISMATCH: not a folder: ${argv[0]}`);
    return 1;
  }
  // Accept the parent deploy-bundle folder as well as the bundle folder.
  let folder = given;
  let entries = listFiles(folder);
  let found = classify(entries);
  if (!found.backend || !found.frontend || !found.worker) {
    const sub = path.join(folder, 'calendar-row9-together');
    try {
      if (statSync(sub).isDirectory()) {
        const subEntries = listFiles(sub);
        const subFound = classify(subEntries);
        if (subFound.backend && subFound.frontend && subFound.worker) {
          folder = sub;
          found = subFound;
          entries = subEntries;
        }
      }
    } catch { /* not a parent folder; keep the original folder */ }
  }
  const labelFile = findAnchor(folder, 'LABEL.txt');
  const sumsFile = findAnchor(folder, 'SHA256SUMS.txt');

  const reasons = [];
  const report = {};
  let backendText = '';
  let workerText = '';
  let frontendText = '';

  // Backend
  if (!found.backend) {
    reasons.push('backend: no .gs file found in the folder');
  } else {
    const data = readFileSync(found.backend.full);
    backendText = data.toString('utf8');
    const version = firstGroup(backendText, /RELEASE_VERSION:\s*['"]([^'"]+)['"]/);
    const buildLabel = extractBuildLabel(backendText, found.backend.name);
    const sourceSha = extractSourceSha(backendText);
    report.backend = { file: found.backend.name, version, buildLabel, sourceSha, sha256: sha256(data) };
    if (!version) reasons.push(`backend: no RELEASE_VERSION marker in ${found.backend.name}`);
    if (!buildLabel) reasons.push(`backend: no release build label in ${found.backend.name} (no gsisBuildLabel, RELEASE_LABEL, BUILD_LABEL, or versioned filename with a build letter; no Source SHA256 header found either)`);
    const missingServices = WORKER_SERVICES.filter((s) => !backendText.includes(s));
    if (missingServices.length) {
      reasons.push(`backend: missing Worker protocol markers: ${missingServices.join(', ')}`);
    }
    const missingBootstrap = FRONTEND_BOOTSTRAP_FIELDS.filter((f) => !backendText.includes(f));
    if (missingBootstrap.length) {
      reasons.push(`backend: missing frontend bootstrap markers the frontend expects: ${missingBootstrap.join(', ')}`);
    }
  }

  // Frontend (inside the zip)
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
        const indexText = indexHtml.toString('utf8');
        const label = firstGroup(indexText, /class="release-label">v?([^<]+)</);
        if (label) report.frontend.buildLabel = label.trim();
        else reasons.push(`frontend: no release label in index.html inside ${found.frontend.name}`);
        const assetVersions = [...new Set([...indexText.matchAll(/\?v=([0-9][0-9A-Za-z.]*)/g)].map((m) => m[1]))];
        report.frontend.assetVersions = assetVersions;
        if (assetVersions.length > 1) {
          reasons.push(`frontend: conflicting asset versions in index.html inside ${found.frontend.name}: ${assetVersions.join(', ')}`);
        }
        if (label && assetVersions.length === 1 && normalizeLabel(label) !== normalizeLabel(assetVersions[0])) {
          reasons.push(`frontend: release label ${label.trim()} does not match asset version ${assetVersions[0]} in index.html inside ${found.frontend.name}`);
        }
      } else {
        reasons.push(`frontend: no index.html inside ${found.frontend.name}`);
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
    workerText = data.toString('utf8');
    const version = firstGroup(workerText, /Calendar Job Worker release\s+([0-9][0-9A-Za-z.]*)/);
    const buildLabel = extractBuildLabel(workerText, found.worker.name);
    const sourceSha = extractSourceSha(workerText);
    report.worker = { file: found.worker.name, version, buildLabel, sourceSha, sha256: sha256(data) };
    if (!version) reasons.push(`job worker: no "Calendar Job Worker release" header in ${found.worker.name}`);
    if (!buildLabel) reasons.push(`job worker: no release build label in ${found.worker.name} (no gsisBuildLabel, RELEASE_LABEL, BUILD_LABEL, or versioned filename with a build letter; no Source SHA256 header found either)`);
    if (!workerText.includes('calendar-mutation-job-v1') || !workerText.includes('gsis-calendar-command-v1')) {
      reasons.push(`job worker: ${found.worker.name} does not call the backend command service`);
    }
    const missingActions = FRONTEND_JOB_ACTIONS.filter((a) => !workerText.includes(a));
    if (missingActions.length) {
      reasons.push(`job worker: missing frontend job actions the frontend expects: ${missingActions.join(', ')}`);
    }
  }

  // Bundle build label and SHA256SUMS anchor.
  let bundleLabel = null;
  if (labelFile) {
    try {
      bundleLabel = readFileSync(labelFile.full, 'utf8').trim();
      report.bundleLabel = { file: labelFile.name, label: bundleLabel, from: labelFile.full };
    } catch { /* unreadable label; treated as absent below */ }
  }
  let sums = null;
  if (sumsFile) {
    try {
      sums = new Map();
      for (const line of readFileSync(sumsFile.full, 'utf8').split('\n')) {
        const m = line.match(/^([a-f0-9]{64})\s+(.+)$/);
        if (m) sums.set(m[2].trim(), m[1]);
      }
      report.sumsFile = sumsFile.name;
    } catch { /* unreadable sums; treated as absent below */ }
  }
  if (sums) {
    for (const key of ['backend', 'frontend', 'worker']) {
      const r = report[key];
      if (!r) continue;
      for (const [sumsPath, sumsHash] of sums.entries()) {
        if (path.basename(sumsPath) === r.file) {
          if (sumsHash !== r.sha256) {
            reasons.push(`${key}: SHA256SUMS mismatch for ${r.file}: expected ${sumsHash}, got ${r.sha256}`);
          } else {
            r.sumsMatch = true;
          }
          break;
        }
      }
    }
  }

  // Build-label comparison: the decisive check. Product version alone
  // cannot prove the same build, because 0.9.9 is shared by 0.9.9f,
  // 0.9.9g, 0.9.9h and 0.9.9i. Every present build label must agree, and
  // a frontend build label with no other label to compare against is
  // a MISMATCH, not a MATCH.
  const labels = [];
  if (report.frontend?.buildLabel) labels.push({ source: 'frontend release label', value: normalizeLabel(report.frontend.buildLabel) });
  if (report.backend?.buildLabel) labels.push({ source: 'backend build label', value: normalizeLabel(report.backend.buildLabel) });
  if (report.worker?.buildLabel) labels.push({ source: 'job worker build label', value: normalizeLabel(report.worker.buildLabel) });
  if (bundleLabel) labels.push({ source: 'bundle LABEL.txt', value: normalizeLabel(bundleLabel) });
  const distinctLabels = [...new Set(labels.map((l) => l.value))];
  if (labels.length >= 2 && distinctLabels.length > 1) {
    reasons.push(`build label: differing build labels: ${labels.map((l) => `${l.source} ${l.value}`).join(', ')}`);
  }
  if (report.frontend?.buildLabel && labels.length === 1) {
    reasons.push(`build label: frontend build label ${normalizeLabel(report.frontend.buildLabel)} has no matching build label in backend, job Worker or bundle LABEL.txt to compare against; product version alone cannot prove the same build`);
  }
  if (!report.frontend?.buildLabel && !bundleLabel && !report.backend?.buildLabel && !report.worker?.buildLabel) {
    reasons.push('build label: no build label found in any piece or bundle LABEL.txt; cannot prove the same build');
  }
  // Backend/Worker missing-label reasons above are informational when a
  // bundle LABEL.txt anchors the build; they must not by themselves
  // turn a labelled bundle into a MISMATCH. Remove them in that case.
  if (bundleLabel) {
    for (let i = reasons.length - 1; i >= 0; i--) {
      if (reasons[i].startsWith('backend: no release build label') || reasons[i].startsWith('job worker: no release build label')) {
        reasons.splice(i, 1);
      }
    }
  }

  // Product version equality (necessary, but not sufficient for MATCH).
  const versions = [
    ['backend', report.backend?.version],
    ['frontend', report.frontend?.version],
    ['job worker', report.worker?.version],
  ].filter(([, v]) => v);
  const distinctVersions = [...new Set(versions.map(([, v]) => v))];
  if (versions.length === 3 && distinctVersions.length !== 1) {
    reasons.push(`product version: backend ${report.backend.version}, frontend ${report.frontend.version}, job worker ${report.worker.version} do not match`);
  }
  if (versions.length < 3) {
    reasons.push('product version: cannot compare all three pieces because a version marker is missing (see above)');
  }
  if (report.frontend?.pagesWorkerVersion && report.frontend.version && report.frontend.pagesWorkerVersion !== report.frontend.version) {
    reasons.push(`frontend: Pages worker version ${report.frontend.pagesWorkerVersion} does not match frontend version ${report.frontend.version}`);
  }

  // Report, then the verdict.
  for (const key of ['backend', 'frontend', 'worker']) {
    const r = report[key];
    if (!r) continue;
    const parts = [`${key}: ${r.file}`, r.version ? `version=${r.version}` : 'version=missing', `sha256=${r.sha256}`];
    if (r.buildLabel) parts.push(`build-label=${r.buildLabel}`);
    if (r.sourceSha) parts.push(`source-sha256=${r.sourceSha}`);
    if (r.sumsMatch) parts.push('sha256sums=match');
    if (r.pagesWorkerVersion) parts.push(`pages-worker-version=${r.pagesWorkerVersion}`);
    console.log(parts.join(' '));
  }
  if (bundleLabel) console.log(`build label: LABEL.txt ${bundleLabel}`);
  if (report.sumsFile) console.log(`sha256sums: ${report.sumsFile}`);
  console.log(`protocol: frontend expects backend bootstrap fields ${FRONTEND_BOOTSTRAP_FIELDS.join(', ')} and version = frontend version; job worker expects backend services: ${WORKER_SERVICES.join(', ')}; frontend job actions: ${FRONTEND_JOB_ACTIONS.join(', ')}`);
  if (reasons.length) {
    console.log('MISMATCH');
    for (const reason of reasons) console.log(`- ${reason}`);
    return 1;
  }
  const buildLabelForMatch = distinctLabels[0];
  console.log(`MATCH: backend, frontend and job worker are all build label ${buildLabelForMatch} and product version ${distinctVersions[0]}`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
