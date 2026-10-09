#!/usr/bin/env bash
# First-load JS per route = the <script src> files named in the route's HTML, gzip bytes as served by `next start` (curl --compressed).
# Excludes chunks the browser prefetches for other routes. Run from the repo root with the production server on :3100.
for r in / /about /analyze /products; do
  tot=0; n=0
  for s in $(curl -s localhost:3100$r | grep -o '/_next/static/[^"]*\.js' | sort -u); do
    b=$(curl -s --compressed -o /dev/null -w '%{size_download}' "localhost:3100$s"); tot=$((tot+b)); n=$((n+1))
  done
  echo "$r first-load JS: $(python3 -c "print(round($tot/1024,1))") KB gzip in $n scripts"
done
