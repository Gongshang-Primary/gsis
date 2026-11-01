'use strict';
const {execFileSync}=require('node:child_process');
execFileSync('python3',['tests/release-version-bundle.py'],{stdio:'inherit',env:{...process.env,TZ:'Asia/Singapore'}});
