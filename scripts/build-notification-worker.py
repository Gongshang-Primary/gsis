"""Build the self-contained dashboard Worker from the same modules as Roster."""
from pathlib import Path
import argparse
import subprocess

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true', help='Fail if generated files differ from source')
args = parser.parse_args()
command = ['node', 'scripts/bundle-worker.cjs', 'notification-worker/dashboard-entry.js', 'notification-worker/dashboard-worker.mjs']
if args.check:
    command.append('--check')
subprocess.run(command, cwd=root, check=True)
module = root / 'notification-worker/dashboard-worker.mjs'
copyable = root / 'notification-worker/dashboard-worker.txt'
if args.check:
    assert copyable.read_bytes() == module.read_bytes(), 'Regenerate dashboard-worker.txt'
else:
    copyable.write_bytes(module.read_bytes())
print('Verified identical dashboard Worker and copyable text' if args.check else 'Built identical dashboard Worker and copyable text')
