import re

with open('contacts-update/public/app.js', 'r') as f:
    content = f.read()

# Fix 1: Edit info can stay locked. We move renderData from try to finally in loadContactData.
# Find `progress.value=progress.max;\n  renderData();`
# Replace with `progress.value=progress.max;`
content = content.replace("progress.value=progress.max;\n  renderData();\n  $('dataStatus').textContent='Ready · '+result.rows.length+' contacts · loaded in '+((Date.now()-started)/1000).toFixed(1)+'s'+(result.editable?'':' · read-only access');", "progress.value=progress.max;\n  $('dataStatus').textContent='Ready · '+result.rows.length+' contacts · loaded in '+((Date.now()-started)/1000).toFixed(1)+'s'+(result.editable?'':' · read-only access');")

# And put renderData() inside the finally block if token===credential&&state?.user.email===owner
finally_block = "finally{clearInterval(timer);dataFlight=null;dataLoading=false;if(token===credential&&state?.user.email===owner){progress.hidden=true;$('dataGrid').setAttribute('aria-busy','false');syncContactDataControls();"
new_finally = "finally{clearInterval(timer);dataFlight=null;dataLoading=false;if(token===credential&&state?.user.email===owner){progress.hidden=true;$('dataGrid').setAttribute('aria-busy','false');syncContactDataControls();renderData();"
content = content.replace(finally_block, new_finally)

# Fix Non-blocking 1: NFKC normalization and collapsed spaces
# const filterText=($('ttbFilter')?.value||'').trim().toLowerCase();
# to
# const filterText=($('ttbFilter')?.value||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
# return String(val||'').toLowerCase().includes(filterText)
# to
# return String(val||'').normalize('NFKC').replace(/\s+/g,' ').toLowerCase().includes(filterText)
# Actually, wait, let's look at `renderData()` definition.
content = content.replace("const filterText=($('ttbFilter')?.value||'').trim().toLowerCase();", "const filterText=($('ttbFilter')?.value||'').normalize('NFKC').replace(/\\s+/g,' ').trim().toLowerCase();")
content = content.replace("return String(val||'').toLowerCase().includes(filterText)", "return String(val||'').normalize('NFKC').replace(/\\s+/g,' ').toLowerCase().includes(filterText)")

# Fix Non-blocking 2: Debounce filter input
# $('ttbFilter').addEventListener('input',()=>renderData());
# to
# let filterDebounce;$('ttbFilter').addEventListener('input',()=>{clearTimeout(filterDebounce);filterDebounce=setTimeout(()=>renderData(),150);});
content = content.replace("$('ttbFilter').addEventListener('input',()=>renderData());", "let filterDebounce;$('ttbFilter').addEventListener('input',()=>{clearTimeout(filterDebounce);filterDebounce=setTimeout(()=>renderData(),150);});")


with open('contacts-update/public/app.js', 'w') as f:
    f.write(content)
