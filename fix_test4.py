import re
with open('tests/contacts-edit-info-filter.cjs', 'r') as f:
    c = f.read()
# Wait, why did the filter not work? Did `renderData()` get called with the debounced input?
# Oh! `String(val||'').normalize('NFKC').replace(/\s+/g,' ').toLowerCase().includes(filterText)`
# filterText is `bob  `.trim() -> `bob`. But `val` is `Bob Jones`. `toLowerCase()` -> `bob jones`. `includes('bob')` -> true.
# Why did it show 3 rows instead of 1? Maybe `ttbFilter` input event wasn't fired properly or `renderData` didn't execute yet?
# Or maybe the data loading triggered a renderData that overwrote it, because we didn't wait long enough?
# Wait! In our mock, `contactData.fields` is `['TTb Name', 'Active']`. `ttbIndex` will be 0.
# The filter logic in `app.js`:
# `const ttbIndex=contactData.fields.indexOf('TTb Name');`
# `const val=dataEdits.get(r.id+'|'+ttbIndex)?.value??r.values[ttbIndex];`
# `return String(val||'').normalize('NFKC').replace(/\s+/g,' ').toLowerCase().includes(filterText)`
# This should work.
# Let's add console.logs to the test script to see why it fails.
