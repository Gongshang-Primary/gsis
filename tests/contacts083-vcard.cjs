'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// These checks consume exported bytes, independently of the serializer helpers.
// A missing name component, unescaped newline, or split UTF-8 character fails here.
const modulePath = path.join(__dirname, '../contacts-update/public/contact-vcard.js');
assert.ok(fs.existsSync(modulePath), 'Contacts needs an on-demand vCard serializer');
const {buildContactVCard} = require(modulePath);
const unfold = text => text.replace(/\r\n[ \t]/g, '');
const linesOf = text => unfold(text).split('\r\n').filter(Boolean);
const valuesOf = (text, property) => linesOf(text).filter(line => line.split(/[;:]/, 1)[0] === property).map(line => line.slice(line.indexOf(':') + 1));
const splitComponents = value => {
 const components = [''];
 for (let i = 0; i < value.length; i++) {
  const char = value[i];
  if (char === '\\') {
   const next = value[++i];
   components[components.length - 1] += /[nN]/.test(next) ? '\n' : next;
  } else if (char === ';') components.push('');
  else components[components.length - 1] += char;
 }
 return components;
};

const person = {
 id:'internal-staff-id', name:'Mdm 林, Anne; Example\\', statutoryName:'Mdm TAN 李 Example',
 basicName:'Do not substitute', mobile:'9123 4567', ext:'2028',
 emails:{gsps:'teacher@gsps.edu.sg', icon:'teacher@moe.edu.sg', ces:'teacher@schools.gov.sg'},
 dayOfBirth:'12', monthOfBirth:'3', birthday:'2000-03-12', roles:['Admin'], absenceReason:'private',
};
const card = buildContactVCard(person);
assert.match(card.filename, /\.vcf$/i);
assert.doesNotMatch(card.filename, /[\\/\x00-\x1f\x7f]/, 'filename cannot contain path separators or controls');
assert.equal(typeof card.text, 'string');
assert.ok(card.text.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n'));
assert.ok(card.text.endsWith('END:VCARD\r\n'));
assert.equal(card.text.replace(/\r\n/g, '').includes('\n'), false, 'physical lines use CRLF');
assert.equal(card.text.replace(/\r\n/g, '').includes('\r'), false);
assert.deepEqual(splitComponents(valuesOf(card.text, 'N')[0]), [person.statutoryName, person.name, '', 'GSPS', '']);
assert.deepEqual(splitComponents(valuesOf(card.text, 'FN')[0]), ['GSPS '+person.name+' '+person.statutoryName]);
assert.deepEqual(valuesOf(card.text, 'TEL'), ['+6591234567']);
assert.deepEqual(valuesOf(card.text, 'EMAIL').sort(), Object.values(person.emails).sort());
assert.deepEqual(valuesOf(card.text, 'ORG'), ['Gongshang Primary School']);
assert.doesNotMatch(card.text, /internal-staff-id|Do not substitute|2000-03-12|Admin|absenceReason|private/);
assert.equal(valuesOf(card.text, 'TEL').some(v => v === '2028'), false, 'extension is not a complete dialable number');

const longName = '林😀é; ,\\'.repeat(40);
const hostile = buildContactVCard({name:longName, statutoryName:'First\r\nTEL:+999999999\nEND:VCARD', mobile:'+44 7700 900123', emails:{gsps:'valid@example.test', icon:'bad\r\nEMAIL:injected@example.test'}});
assert.equal(valuesOf(hostile.text, 'N').length, 1);
assert.equal(valuesOf(hostile.text, 'END').length, 1, 'name text cannot inject another card boundary');
assert.deepEqual(valuesOf(hostile.text, 'TEL'), ['+447700900123']);
assert.deepEqual(valuesOf(hostile.text, 'EMAIL'), ['valid@example.test']);
assert.deepEqual(splitComponents(valuesOf(hostile.text, 'N')[0]), ['First\nTEL:+999999999\nEND:VCARD', longName, '', 'GSPS', '']);
for (const line of hostile.text.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, 'each folded physical line is at most 75 UTF-8 octets');
assert.ok(hostile.text.includes('\r\n '), 'long fields are folded');
assert.equal(hostile.text.includes('\ufffd'), false, 'Unicode is not corrupted at a fold');
assert.equal(Buffer.from(hostile.text, 'utf8').toString('utf8'), hostile.text);

const missingFirst = buildContactVCard({statutoryName:'Legal Name', basicName:'Forbidden fallback', emails:{gsps:'a@example.test'}});
assert.deepEqual(splitComponents(valuesOf(missingFirst.text, 'N')[0]), ['Legal Name', '', '', 'GSPS', '']);
const missingLast = buildContactVCard({name:'TTb Only', basicName:'Forbidden fallback', mobile:'001 202 555 0123'});
assert.deepEqual(splitComponents(valuesOf(missingLast.text, 'N')[0]), ['', 'TTb Only', '', 'GSPS', '']);
assert.deepEqual(valuesOf(missingLast.text, 'TEL'), ['+12025550123']);
assert.deepEqual(valuesOf(buildContactVCard({name:'Country code already present', mobile:'65 9123 4567'}).text, 'TEL'), ['+6591234567'], 'an existing Singapore country code is preserved as an international number');
const emptyOptional = buildContactVCard({name:'TTb Only', mobile:'not a phone', emails:{gsps:'', icon:'bad address'}});
assert.deepEqual(valuesOf(emptyOptional.text, 'EMAIL'), []);
assert.deepEqual(valuesOf(emptyOptional.text, 'TEL'), []);
assert.deepEqual(splitComponents(valuesOf(buildContactVCard({name:'  Name  ', statutoryName:'  Legal  '}).text, 'N')[0]), ['  Legal  ', '  Name  ', '', 'GSPS', ''], 'source names are not silently rewritten');
assert.equal(buildContactVCard(person).text, card.text, 'same loaded contact produces the same content without live reads');
console.log('PASS Contacts vCard bytes: exact name mapping, mobile/emails, exclusions, escaping, Unicode folding, missing fields and deterministic local output');
