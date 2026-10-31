import re
with open('tests/contacts-edit-info-filter.cjs', 'r') as f:
    c = f.read()
c = c.replace("w.crypto = { randomUUID: () => 'uuid-' + Math.random() };", "Object.defineProperty(w, 'crypto', { value: { randomUUID: () => 'uuid-' + Math.random() }, configurable: true, writable: true });")
with open('tests/contacts-edit-info-filter.cjs', 'w') as f:
    f.write(c)
