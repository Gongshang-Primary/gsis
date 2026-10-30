'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8'),a=source.indexOf(' const dateFormat='),b=source.indexOf(' const singaporeToday=',a),c=source.indexOf(' function notificationStatus('),d=source.indexOf(' function acknowledgementDashboard(',c);
const format=vm.runInNewContext(source.slice(a,b)+source.slice(c,d)+';({stamp,notificationStatus})',{Intl,Date,Object,esc:value=>String(value)});
const expected='29 Oct 2026, 06:55:34';
for(const value of ['1793228134000','1793228134',1793228134000,'2026-10-28T22:55:34.000Z']){
 assert.equal(format.stamp(value),expected);
 const html=format.notificationStatus({staffId:'x',name:'Teacher',notification:{state:'delivered',deliveryAt:value}});
 assert(html.includes(expected+' Singapore time.'));assert(!html.includes('1793228134'));
}
assert.equal(format.stamp('unknown'),'unknown');assert.equal(format.stamp(''),'');
console.log('PASS provider seconds/milliseconds, ISO and numeric timestamps format in Singapore delivery markup');
