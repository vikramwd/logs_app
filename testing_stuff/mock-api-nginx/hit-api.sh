#!/usr/bin/env bash
set -euo pipefail

# Edit these values as needed
URL_PROFILE="http://localhost:9999/api/profile"
URL_MOCK="http://localhost:9999/api/mock-data"
COUNT=100
MAX_ID=100
MIN_DELAY=1
MAX_DELAY=10

if [ "$MAX_DELAY" -lt "$MIN_DELAY" ]; then
  echo "MAX_DELAY must be >= MIN_DELAY"
  exit 1
fi

run_hit() {
  local id
  id=$(( (RANDOM % MAX_ID) + 1 ))
  curl -s "${URL_PROFILE}?id=${id}" > /dev/null &
  curl -s "${URL_MOCK}?id=${id}" > /dev/null &
  wait
  echo "$id"
}

for ((i=1; i<=COUNT; i++)); do
  ids=()
  for j in {1..1}; do
    ids+=("$(run_hit &)")
  done
  wait
  delay=$(( (RANDOM % (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY ))
  percent=$(( (i * 100) / COUNT ))
  printf "Progress: %3d%% (%d/%d) -> batch=10, sleep=%ds\n" "$percent" "$i" "$COUNT" "$delay"
  sleep "$delay"
done
