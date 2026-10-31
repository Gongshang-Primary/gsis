with open('contacts-update/public/app.js', 'r') as f:
    content = f.read()

import re

# Fix 1: Edit info can stay locked. We move renderData() into finally.
load_fn = "finally{clearInterval(timer);dataFlight=null;dataLoading=false;if(token===credential&&state?.user.email===owner){progress.hidden=true;$('dataGrid').setAttribute('aria-busy','false');syncContactDataControls();}window.GSISTableRefresh?.();}})();"
load_fn_new = "finally{clearInterval(timer);dataFlight=null;dataLoading=false;if(token===credential&&state?.user.email===owner){progress.hidden=true;$('dataGrid').setAttribute('aria-busy','false');syncContactDataControls();renderData();}window.GSISTableRefresh?.();}})();"
content = content.replace(load_fn, load_fn_new)

# In try block of loadContactData we have:
# progress.value=progress.max;\n  renderData();\n  $('dataStatus').textContent='Ready
# Remove renderData() from there.
content = content.replace("progress.value=progress.max;\n  renderData();\n  $('dataStatus').textContent", "progress.value=progress.max;\n  $('dataStatus').textContent")


with open('contacts-update/public/app.js', 'w') as f:
    f.write(content)
