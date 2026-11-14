'use strict';
const {execFileSync}=require('node:child_process');
execFileSync(process.execPath,['tests/roster-reoptimise-priority-parity.mjs'],{stdio:'inherit',env:{...process.env,GSIS_ADHOC_INACTIVE:'1'}});
