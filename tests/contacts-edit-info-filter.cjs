const assert = require('assert');
const fs = require('fs');

async function run() {
  const html = fs.readFileSync('contacts-update/public/index.html', 'utf8');
  assert(html.includes('id="ttbFilter"'), 'Missing id="ttbFilter"');
  assert(html.includes('placeholder="Find by TTb name"'), 'Missing placeholder="Find by TTb name"');

  const js = fs.readFileSync('contacts-update/public/app.js', 'utf8');
  assert(js.includes('ttbFilter'), 'Missing ttbFilter references in JS');

  console.log('Passed simple checks for Contacts Edit Info Filter');
}
run();
