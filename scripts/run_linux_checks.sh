#!/usr/bin/env bash
set -euo pipefail

# Run strict syntax compile checks for all project Python files.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ ! -f ".venv-linux/bin/activate" ]; then
  echo "Missing .venv-linux. Run scripts/setup_linux_env.sh first."
  exit 1
fi

source .venv-linux/bin/activate

python - <<'PY'
import pathlib
import py_compile
import sys

root = pathlib.Path('.')
files = sorted(
    p for p in root.rglob('*.py')
    if '.venv' not in p.parts and '.venv-linux' not in p.parts
    and '__pycache__' not in p.parts and '.git' not in p.parts
)

for f in files:
    print(f"CHECK {f}")
    py_compile.compile(str(f), doraise=True)
    print(f"OK {f}")

print("ALL_PY_FILES_COMPILE")
PY
