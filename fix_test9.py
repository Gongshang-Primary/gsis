import re
with open('contacts-update/public/app.js', 'r') as f:
    content = f.read()

# Let's verify `renderData()` logic.
render_data = content[content.find('function renderData(){'):content.find('function renderDataStatus(){')]
print("renderData:", render_data)
