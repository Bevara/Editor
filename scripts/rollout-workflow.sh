#!/bin/bash
# Deploys scripts/build-accessors.yml to the filter repositories of Bevara.
#
#   scripts/rollout-workflow.sh [--apply] <repo> [repo...]
#
# Without --apply, nothing is pushed: the script only reports what would change.
# Requires `gh` authenticated with write access to the Bevara organisation.
set -uo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
TEMPLATE="$REPO_ROOT/scripts/build-accessors.yml"
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

APPLY=0
[ "${1:-}" = "--apply" ] && { APPLY=1; shift; }
[ $# -eq 0 ] && { echo "usage: $0 [--apply] <repo> [repo...]" >&2; exit 2; }

MSG=$(cat <<'COMMIT'
Fix CI toolchain and publish accessor releases

The prebuilt libraries in lib/ are compiled with emsdk 6.0.8 (see
Bevara/third_parties/emsdk_vers.txt) and carry the bulk-memory-opt
target feature, which the wasm-opt shipped with emcc 3.1.56 rejects:

  Unknown option '--enable-bulk-memory-opt'

Pin EMCC_VERSION to 6.0.8 so the CI toolchain matches the libraries.

Also publish the built accessor as a release asset instead of leaving
it as a run artifact, so that the filter list consumed by the editor
picks it up. The release is tagged TAG_NUMBER and updated in place on
subsequent builds of the default branch.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
COMMIT
)

for repo in "$@"; do
	dir="$WORKDIR/$repo"
	if ! gh repo clone "Bevara/$repo" "$dir" -- --depth 1 -q >/dev/null 2>&1; then
		echo "! $repo: clone failed"
		continue
	fi
	branch=$(git -C "$dir" rev-parse --abbrev-ref HEAD)
	mkdir -p "$dir/.github/workflows"
	cp "$TEMPLATE" "$dir/.github/workflows/build-accessors.yml"
	if git -C "$dir" diff --quiet -- .github/workflows/build-accessors.yml && \
	   [ -z "$(git -C "$dir" status --porcelain -- .github/workflows/build-accessors.yml)" ]; then
		echo "= $repo: already up to date"
		continue
	fi
	if [ "$APPLY" -eq 0 ]; then
		echo "~ $repo ($branch): would update .github/workflows/build-accessors.yml"
		continue
	fi
	git -C "$dir" add .github/workflows/build-accessors.yml
	# Push with the gh credential: the system helper may resolve to another
	# account that has no write access on these repositories.
	if git -C "$dir" commit -q -m "$MSG" &&
	   git -C "$dir" -c credential.helper= \
	       -c credential.helper='!gh auth git-credential' push -q origin "HEAD:$branch"; then
		echo "+ $repo ($branch): pushed"
	else
		echo "! $repo ($branch): push failed"
	fi
done
