"""One explicit installation inventory, shared by the builder and verifier."""
import json
from pathlib import Path

def installation_manifest(root, version):
    spec = json.loads((root / 'release-installation-manifest.json').read_text())
    assert spec['schema'] == 1
    assert spec['frontends'] == {'Contacts':'contacts-update/public', 'Deploy':'public',
        'Layout':'layout-update/public', 'Roster':'roster-update/public', 'Calendar':'calendar-update/public',
        'LORD':'lord-suite/Source/lord', 'OVERLORD':'lord-suite/Source/overlord',
        'STARLORD':'lord-suite/Source/starlord', 'Venues':'venues-viewport/public'}
    assert spec['backends'] == ['Contacts', 'Deploy', 'Roster', 'Calendar', 'LORD', 'Venues']
    assert {'README.md', 'docs/architecture/GSiS_v{version}_Architecture.html',
        'docs/GSiS-v{version}-User-Manual.html', 'docs/asc-skill.md'} <= set(spec['documents'])
    members = {f'{name}_Frontend_v{version}.zip': root / f'{name}_Frontend_v{version}.zip' for name in spec['frontends']}
    members.update({f'{name}_Backend_v{version}.gs': root / f'{name}_Backend_v{version}.gs' for name in spec['backends']})
    for name, source in spec['workers'].items():
        relative = Path(source)
        assert name.endswith('_v{version}.txt') and '/' not in name and '\\' not in name
        assert not relative.is_absolute() and '..' not in relative.parts and relative.suffix == '.txt'
        members[name.format(version=version)] = root / relative
    for name in spec['documents']:
        relative = Path(name.format(version=__import__('re').sub(r'[a-z]$', '', version)))
        assert not relative.is_absolute() and '..' not in relative.parts and '\\' not in name
        assert str(relative) == 'README.md' or (relative.parts[0] == 'docs' and len(relative.parts) in (2, 3))
        members[relative.as_posix()] = root / relative
    for name in spec.get('migrations',[]):
        relative=Path(name)
        assert len(relative.parts)==2 and relative.parts[0]=='migrations' and relative.suffix=='.sql'
        assert not relative.is_absolute() and '..' not in relative.parts and '\\' not in name
        members[name]=root/relative
    assert len(members) == len(spec['frontends']) + len(spec['backends']) + len(spec['workers']) + len(spec['documents']) + len(spec.get('migrations',[]))
    return spec, members
