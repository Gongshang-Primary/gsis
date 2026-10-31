with open('tests/contacts-edit-info-filter.cjs', 'r') as f:
    content = f.read()

# JS debounce issue: setTimeout in jsdom VM doesn't advance implicitly if we just sleep in node.
# We need to manually advance timers or just call renderData() directly for testing, or wait longer.
# Wait, JSDOM setTimeout might not work easily across contexts or with Node's Promise.
# Let's just bypass the UI event and directly execute `renderData` or dispatch the event and wait enough.
# Actually, since it's `setTimeout` in VM context, we can wait longer or just call the function.
# The review said debounce 150ms. Let's wait 300ms.
content = content.replace("await new Promise(r => setTimeout(r, 200));", "await new Promise(r => setTimeout(r, 500));")
with open('tests/contacts-edit-info-filter.cjs', 'w') as f:
    f.write(content)
