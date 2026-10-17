"""Run one existing Playwright CLI flow and require an explicit passed result."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
name = sys.argv[1] if len(sys.argv) == 2 else ''
if not re.fullmatch(r'[a-z0-9-]+', name):
    raise SystemExit('Usage: python3 scripts/qa/run-browser.py FLOW_NAME')
source = (root / 'scripts' / 'qa' / (name + '.cjs')).read_bytes()
cli = Path(os.environ.get('PLAYWRIGHT_CLI', str(Path.home() / '.codex/skills/playwright/scripts/playwright_cli.sh')))
if not cli.is_file():
    raise SystemExit('Set PLAYWRIGHT_CLI to the installed Playwright skill wrapper.')
completed = subprocess.run(['bash', str(cli), '--session', os.environ.get('PWCLI_SESSION', 'writeascend-model-cloud'), 'run-code', source.decode()], cwd=root, capture_output=True, text=True)
output = completed.stdout + completed.stderr
folder = root / 'output'
folder.mkdir(exist_ok=True)
(folder / (name + '-browser.txt')).write_text(output)
result = None
try:
    result = json.loads(completed.stdout.split('### Result\n', 1)[1].split('\n###', 1)[0])
except (IndexError, ValueError):
    pass
passed = completed.returncode == 0 and '### Error' not in output and '### Ran Playwright code' in output and isinstance(result, dict) and result.get('passed') is True
record = {'passed': passed, 'scriptSha256': hashlib.sha256(source).hexdigest(), 'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'result': result}
if not passed:
    record['error'] = output.split('### Error\n', 1)[-1].splitlines()[0][:300] if output.strip() else 'No CLI output.'
(folder / (name + '-browser.json')).write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record))
raise SystemExit(0 if passed else 1)
