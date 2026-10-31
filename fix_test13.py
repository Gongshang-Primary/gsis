# If dataLoading is false, and visibleRows length is 1, why is it rendering 3 rows?
# Let's check what `run('renderData()')` does.
# Is it possible that `renderStaffGrid` behaves differently if `data` is changed?
# Wait! In `renderData()`, `renderStaffGrid('dataGrid', renderDataData, ...)` is called.
# Does `renderStaffGrid` update the DOM?
# Let's check `renderStaffGrid` definition.
with open('contacts-update/public/app.js', 'r') as f:
    content = f.read()

render_grid = content[content.find('function renderStaffGrid'):content.find('function loadAux')]
print("renderStaffGrid:", render_grid)
