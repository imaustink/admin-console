#!/bin/bash
# Bump version in package.json, src-tauri/Cargo.toml, and src-tauri/tauri.conf.json
# then commit, tag, and push to trigger the release workflow.

set -e

BUMP_TYPE="${1:-patch}"

if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" && ! "$BUMP_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Usage: $0 [patch|minor|major|x.y.z]"
    echo "  Default: patch"
    exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
    echo "Error: Working directory is not clean. Commit or stash changes first."
    exit 1
fi

# Bump package.json (produces the new version)
npm version "$BUMP_TYPE" --no-git-tag-version

NEW_VERSION=$(node -p "require('./package.json').version")
TAG="v${NEW_VERSION}"
echo "Bumping to ${TAG}..."

# Sync Cargo.toml
sed -i "s/^version = \".*\"/version = \"${NEW_VERSION}\"/" src-tauri/Cargo.toml

# Sync tauri.conf.json
python3 -c "
import json, sys
with open('src-tauri/tauri.conf.json') as f:
    d = json.load(f)
d['version'] = '${NEW_VERSION}'
with open('src-tauri/tauri.conf.json', 'w') as f:
    json.dump(d, f, indent=2)
    f.write('\n')
"

git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "chore: release version ${NEW_VERSION}"
git push

git tag "$TAG"
git push origin "$TAG"

echo "Done! Released ${TAG} — GitHub Actions will build and publish the release."
