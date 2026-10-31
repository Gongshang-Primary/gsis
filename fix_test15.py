with open('tests/contacts-edit-info-filter.cjs', 'r') as f:
    content = f.read()

# I see what's happening. `contactData.rows` inside `app.js` is an array of objects.
# Is `visibleRows` correctly constructed inside `renderData`?
# Let's log `renderDataData.rows.length` from inside `renderData()` if we can, or just log `visibleRows` directly from node.
content = content.replace("try {\n    run('renderData()');", """
  try {
    run('renderData()');
    console.log('grid innerHTML after renderData:', doc.querySelector('#dataGrid').innerHTML);
""")
with open('tests/contacts-edit-info-filter.cjs', 'w') as f:
    f.write(content)
