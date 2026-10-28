"""Compile an artifact-tool-authored template into browser-readable assets."""
import base64, json, sys, zipfile
from pathlib import Path
source, destination = map(Path, sys.argv[1:3])
with zipfile.ZipFile(source) as archive:
    files = {name: ({'base64': base64.b64encode(archive.read(name)).decode()}
                    if name.endswith('.png') else archive.read(name).decode('utf-8-sig'))
             for name in archive.namelist()}
placements = json.loads(Path(str(source)+'.placements.json').read_text())
destination.write_text(json.dumps({'placements': placements, 'files': files}, separators=(',', ':')))
