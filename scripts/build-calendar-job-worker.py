"""Copy the self-contained Calendar job module without bundling or deployment."""
from pathlib import Path
import argparse

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path)
args = parser.parse_args()
source = (root / 'calendar-job-worker/worker.mjs').read_bytes()
outputs = [args.output] if args.output else [root / 'calendar-job-worker/dashboard-worker.mjs', root / 'calendar-job-worker/dashboard-worker.txt']
for output in outputs:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(source)
