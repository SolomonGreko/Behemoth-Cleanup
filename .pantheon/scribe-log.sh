#!/bin/bash
# scribe-log.sh — append an event to the Pantheon event log
# Usage: bash .pantheon/scribe-log.sh <agent> <type> <task_id> "<summary>" "<delta>"

AGENT="${1:-unknown}"
TYPE="${2:-heartbeat}"
TASK_ID="${3:-none}"
SUMMARY="${4:-}"
DELTA="${5:-}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p .pantheon/digests .pantheon/auditorium

printf '{"ts":"%s","agent":"%s","type":"%s","task_id":"%s","summary":"%s","delta":"%s"}\n' \
    "$TIMESTAMP" "$AGENT" "$TYPE" "$TASK_ID" "$SUMMARY" "$DELTA" \
    >> .pantheon/event-log.jsonl
