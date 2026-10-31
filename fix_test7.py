# Let's check how the debounce is implemented in app.js
with open('contacts-update/public/app.js', 'r') as f:
    content = f.read()

print("Debounce logic:", content[content.find("if($('ttbFilter')){"):content.find("$('reloadData').onclick")])
