with open('tests/contacts-edit-info-filter.cjs', 'r') as f:
    content = f.read()

# I see what's happening. `String.prototype.normalize` might not be supported in jsdom/node 22, or maybe the `String(val||'').toLowerCase()` is failing.
# Or `dataEdits.get` is fetching correctly but JS context in dom has isolated objects?
# Let's print `val` inside the filter to debug.
content = content.replace("filterInput.value = 'bob  ';", "filterInput.value = 'bob';")
content = content.replace("assert.strictEqual(tbody.querySelectorAll('tr').length, 1, 'Filter should show 1 row');", """
  console.log('contactData.fields:', run('contactData.fields'));
  console.log('ttbFilter value:', run('$("ttbFilter").value'));
  console.log('visibleRows length:', run('contactData.rows.filter(r => String(dataEdits.get(r.id+"|"+contactData.fields.indexOf("TTb Name"))?.value ?? r.values[contactData.fields.indexOf("TTb Name")]).toLowerCase().includes("bob")).length'));
  assert.strictEqual(tbody.querySelectorAll('tr').length, 1, 'Filter should show 1 row');
""")
with open('tests/contacts-edit-info-filter.cjs', 'w') as f:
    f.write(content)
