with open('tests/contacts-edit-info-filter.cjs', 'r') as f:
    content = f.read()

# Instead of waiting for setTimeout in VM, we can just call `renderData()` directly in the test to force it immediately.
content = content.replace("filterInput.dispatchEvent(new w.Event('input'));", "filterInput.dispatchEvent(new w.Event('input'));\n  run('renderData()');")

with open('tests/contacts-edit-info-filter.cjs', 'w') as f:
    f.write(content)
