with open('tests/contacts-edit-info-filter.cjs', 'r') as f:
    content = f.read()

content = content.replace("assert.strictEqual(tbody.querySelectorAll('tr').length, 1, 'Filter should show 1 row');", """
  console.log('dataLoading:', run('dataLoading'));
  assert.strictEqual(tbody.querySelectorAll('tr').length, 1, 'Filter should show 1 row');
""")
with open('tests/contacts-edit-info-filter.cjs', 'w') as f:
    f.write(content)
