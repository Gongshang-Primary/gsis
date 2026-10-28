"""Build self-contained private operations Worker for Cloudflare dashboard installation."""
from pathlib import Path
import argparse
import subprocess

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
command = ['node', 'scripts/bundle-worker.cjs', 'operations-worker/index.js', 'operations-worker/dashboard-worker.mjs']
if args.check:
    command.append('--check')
subprocess.run(command, cwd=root, check=True)
module = root / 'operations-worker/dashboard-worker.mjs'
copyable = root / 'operations-worker/dashboard-worker.txt'
if args.check:
    assert copyable.read_bytes() == module.read_bytes(), 'Regenerate operations dashboard-worker.txt'
else:
    copyable.write_bytes(module.read_bytes())
print('Verified private operations Worker' if args.check else 'Built private operations Worker')
