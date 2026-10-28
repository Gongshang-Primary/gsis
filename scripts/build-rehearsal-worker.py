"""Build only the isolated 0.9.8i rehearsal Worker and optional standalone ZIP."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--zip', type=Path, help='Create a separate rehearsal ZIP; never install into production packages')
    args = parser.parse_args()
    destination = ROOT / 'rehearsal-worker/dist/worker.mjs'
    if not args.check:
        destination.parent.mkdir(parents=True, exist_ok=True)
    cmd = ['node', 'scripts/build-rehearsal-worker.cjs']
    if args.check:
        cmd.append('--check')
    subprocess.run(cmd, cwd=ROOT, check=True)
    if args.zip:
        if args.check:
            parser.error('--zip and --check cannot be combined')
        files = {
            'worker.mjs': destination,
            'schema.sql': ROOT / 'rehearsal-worker/schema.sql',
            'wrangler.example.toml': ROOT / 'rehearsal-worker/wrangler.example.toml',
            'setup-rehearsal.py': ROOT / 'scripts/setup-rehearsal.py',
            'REHEARSAL_SETUP.md': ROOT / 'docs/v098i/REHEARSAL_SETUP.md',
            'SNAPSHOT_SCHEMA.md': ROOT / 'docs/v098i/REHEARSAL_SNAPSHOT_SCHEMA.md',
        }
        manifest = {'release':'0.9.8i','workerName':'gsis-roster-rehearsal','productionInstallation':False,
                    'deployed':False,'schema':'gsis.rehearsal.snapshot','schemaVersion':1,
                    'files':{name:hashlib.sha256(path.read_bytes()).hexdigest() for name,path in files.items()}}
        args.zip.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(args.zip, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for name, path in files.items():
                info = zipfile.ZipInfo(name, (2026,10,27,0,0,0))
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info,path.read_bytes())
            archive.writestr(zipfile.ZipInfo('MANIFEST.json',(2026,10,27,0,0,0)),json.dumps(manifest,indent=2)+'\n')
        print('Created separate rehearsal package:', args.zip)
        print('SHA256:',hashlib.sha256(args.zip.read_bytes()).hexdigest())

if __name__ == '__main__':
    main()
