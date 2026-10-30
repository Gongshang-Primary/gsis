// Verify actual 0.9.9 archives, keeping candidate output separate from deliveries.
'use strict';
const path = require('node:path');
const {execFileSync} = require('node:child_process');
module.exports = function suiteCandidate(root) {
  const recoveredSuite = process.env.GSIS_RECOVERY_SUITE;
  const recoveredReview = process.env.GSIS_RECOVERY_REVIEW;
  if (recoveredSuite || recoveredReview) {
    if (!recoveredSuite || !recoveredReview) throw Error('Recovery requires both exact archive paths');
    execFileSync('python3', ['scripts/verify-099-suite.py', recoveredSuite, recoveredReview,
      '--source-root', root, ...(process.env.GSIS_RECOVERY_PREVIEW === 'true' ? ['--preview'] : [])], {cwd: root, stdio: 'pipe'});
    return recoveredSuite;
  }
  const version=require(path.join(root, 'package.json')).gsisRelease;
  const output = path.join(root, 'verification/v099/package-candidate');
  const suite = path.join(output, 'GSiS_v'+version+'_Full_Suite.zip');
  const review = path.join(output, 'GSiS_v'+version+'_Review_Source.zip');
  execFileSync('python3', ['scripts/package-timetable-preparation.py', '--zip',
    path.join(output, 'GSiS_v0.9.9_Timetable_Preparation.zip')], {cwd: root, stdio: 'pipe'});
  execFileSync('python3', ['scripts/package-099-suite.py', '--preview', '--output-dir', output], {cwd: root, stdio: 'pipe'});
  execFileSync('python3', ['scripts/verify-099-suite.py', suite, review, '--preview'], {cwd: root, stdio: 'pipe'});
  return suite;
};
