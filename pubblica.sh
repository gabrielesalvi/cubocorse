#!/usr/bin/env bash
# Importa il gioco dall'ultimo commit di cubo-corse + commit + push. Il push su main È la pubblicazione.
# Uso: ./pubblica.sh "messaggio di commit"
set -euo pipefail
cd "$(dirname "$0")"
PY=~/.openclaw/.venv/bin/python3
msg="${1:?serve un messaggio di commit}"
$PY strumenti/importa.py
git add -A
git commit -m "$msg"
git push
