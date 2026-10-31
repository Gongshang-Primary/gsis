with open('tests/contacts-edit-info-filter.cjs', 'r') as f:
    content = f.read()

# I see. JSDOM doesn't support Element.replaceChildren!
# `else grid.replaceChildren(...holder.children);` might be silently failing in JSDOM, or JSDOM doesn't throw but it doesn't update the DOM.
# Actually, JSDOM does support replaceChildren since v19. We are on jsdom 30.1.1. So it should work.
# Wait, `holder.children` is an HTMLCollection.
# Maybe I should just call `renderData()` explicitly in Node instead of waiting for setTimeout in VM.
# Let's run `run('renderData()')` and then log the error if any.
content = content.replace("console.log('dataLoading:', run('dataLoading'));", """
  try {
    run('renderData()');
  } catch (err) {
    console.log('renderData error:', err);
  }
""")
with open('tests/contacts-edit-info-filter.cjs', 'w') as f:
    f.write(content)
