#!/bin/bash

set -e

BUMP_TYPE="${1:-patch}"

# Validate bump type or explicit version
if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" && ! "$BUMP_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: $0 [patch|minor|major|x.y.z]"
  echo "  Default: patch"
  exit 1
fi

# Ensure working directory is clean
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: Working directory is not clean. Commit or stash changes first."
  exit 1
fi

# Bump version in package.json (--no-git-tag-version so we control the commit/tag)
if [[ "$BUMP_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  npm version "$BUMP_TYPE" --no-git-tag-version
else
  npm version "$BUMP_TYPE" --no-git-tag-version
fi

NEW_VERSION=$(node -p "require('./package.json').version")
TAG="v${NEW_VERSION}"

echo "Bumping to ${TAG}..."

git add package.json package-lock.json
git commit -m "chore: release version ${NEW_VERSION}"
git push

git tag "$TAG"
git push origin "$TAG"

echo "Done! Released ${TAG}"
