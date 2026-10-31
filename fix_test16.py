with open('tests/contacts-edit-info-filter.cjs', 'r') as f:
    content = f.read()

# OH!
# `assert.strictEqual(tbody.querySelectorAll('tr').length, 1, 'Filter should show 1 row');`
# I stored `tbody` earlier as `const tbody = $('#dataGrid tbody');` BEFORE the DOM was replaced!
# So `tbody` is detached!
# I need to do `assert.strictEqual($('#dataGrid tbody').querySelectorAll('tr').length, 1)`!
content = content.replace("tbody.querySelectorAll('tr').length", "$('#dataGrid tbody').querySelectorAll('tr').length")
content = content.replace("tbody rows: <tr class=\\"\\">", "...")

with open('tests/contacts-edit-info-filter.cjs', 'w') as f:
    f.write(content)
