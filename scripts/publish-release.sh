#!/bin/bash
# Publishes the locally built accessor of a filter as its GitHub release asset.
#
#   scripts/publish-release.sh [--apply] <repo> [repo...]
#
# Uses Interface/player/build/dist/<repo>_1.wasm and
# Interface/player/filters/<repo>/<repo>.json, i.e. the artefacts produced by
# the monorepo build, and uploads them to release TAG_NUMBER of each filter
# repository. Unlike pushing the CI workflow, this only needs the `repo` scope.
set -uo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
PLAYER="$REPO_ROOT/Interface/player"
TAG=1
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

APPLY=0
[ "${1:-}" = "--apply" ] && { APPLY=1; shift; }
[ $# -eq 0 ] && { echo "usage: $0 [--apply] <repo> [repo...]" >&2; exit 2; }

for repo in "$@"; do
	wasm="$PLAYER/build/dist/${repo}_1.wasm"
	desc="$PLAYER/filters/${repo}/${repo}.json"
	if [ ! -f "$wasm" ] || [ ! -f "$desc" ]; then
		echo "! $repo: missing local artefacts, build the player first"
		continue
	fi
	if ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$desc" 2>/dev/null; then
		echo "! $repo: $desc is not valid JSON"
		continue
	fi
	if [ "$APPLY" -eq 0 ]; then
		echo "~ $repo: would publish ${repo}_1.wasm ($(wc -c < "$wasm" | tr -d ' ') bytes) and ${repo}_1.json"
		continue
	fi
	cp "$wasm" "$STAGE/${repo}_1.wasm"
	cp "$desc" "$STAGE/${repo}_1.json"
	if gh release view "$TAG" -R "Bevara/$repo" >/dev/null 2>&1; then
		if gh release upload "$TAG" "$STAGE/${repo}_1.wasm" "$STAGE/${repo}_1.json" -R "Bevara/$repo" --clobber >/dev/null 2>&1; then
			echo "+ $repo: release $TAG updated"
		else
			echo "! $repo: upload failed"
		fi
	elif gh release create "$TAG" "$STAGE/${repo}_1.wasm" "$STAGE/${repo}_1.json" \
		-R "Bevara/$repo" --title "$TAG" \
		--notes "Accessor built from the filters monorepo (emsdk 6.0.8)." >/dev/null 2>&1; then
		echo "+ $repo: release $TAG created"
	else
		echo "! $repo: release creation failed"
	fi
	rm -f "$STAGE/${repo}_1.wasm" "$STAGE/${repo}_1.json"
done
