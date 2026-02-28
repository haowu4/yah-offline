#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/publish-app.sh [options]

Options:
  --dry-run                Run npm publish in dry-run mode.
  --tarball-dir <path>     Output directory for packed tarball (default: /tmp).
  --access <mode>          npm publish access mode: public|restricted (default: public).
  --tag <tag>              npm dist-tag for publish (optional).
  -h, --help               Show help.
EOF
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/packages/app"
TARBALL_DIR="/tmp"
ACCESS="public"
TAG=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --tarball-dir)
      TARBALL_DIR="${2:-}"
      if [[ -z "$TARBALL_DIR" ]]; then
        echo "Missing value for --tarball-dir" >&2
        exit 1
      fi
      shift 2
      ;;
    --access)
      ACCESS="${2:-}"
      if [[ "$ACCESS" != "public" && "$ACCESS" != "restricted" ]]; then
        echo "Invalid --access value: $ACCESS" >&2
        exit 1
      fi
      shift 2
      ;;
    --tag)
      TAG="${2:-}"
      if [[ -z "$TAG" ]]; then
        echo "Missing value for --tag" >&2
        exit 1
      fi
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required but not found in PATH." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but not found in PATH." >&2
  exit 1
fi

mkdir -p "$TARBALL_DIR"

echo "==> Running prepublish checks and builds"
pnpm --dir "$APP_DIR" run prepublishOnly

echo "==> Packing app package to $TARBALL_DIR"
PACK_OUTPUT="$(pnpm --dir "$APP_DIR" pack --pack-destination "$TARBALL_DIR")"
printf '%s\n' "$PACK_OUTPUT"

TARBALL_PATH="$(printf '%s\n' "$PACK_OUTPUT" | awk '/\.tgz$/ {print $0}' | tail -n1)"
if [[ -z "$TARBALL_PATH" || ! -f "$TARBALL_PATH" ]]; then
  echo "Failed to locate generated tarball path from pnpm pack output." >&2
  exit 1
fi

echo "==> Verifying runtime files inside tarball"
if ! tar -tzf "$TARBALL_PATH" | grep -q 'package/runtime/public/index.html'; then
  echo "Missing runtime/public/index.html in tarball: $TARBALL_PATH" >&2
  exit 1
fi
if ! tar -tzf "$TARBALL_PATH" | grep -q 'package/runtime/docs/getting-started.md'; then
  echo "Missing runtime/docs/getting-started.md in tarball: $TARBALL_PATH" >&2
  exit 1
fi
if tar -tzf "$TARBALL_PATH" | grep -q '^package/src/'; then
  echo "Tarball must not include TypeScript source directory (package/src): $TARBALL_PATH" >&2
  exit 1
fi
if ! tar -tzf "$TARBALL_PATH" | grep -q '^package/dist/cli.js$'; then
  echo "Missing compiled CLI entrypoint (package/dist/cli.js) in tarball: $TARBALL_PATH" >&2
  exit 1
fi
if ! tar -tzf "$TARBALL_PATH" | grep -q '^package/bin/yah.js$'; then
  echo "Missing CLI binary launcher (package/bin/yah.js) in tarball: $TARBALL_PATH" >&2
  exit 1
fi

PUBLISH_CMD=(npm publish "$TARBALL_PATH" --access "$ACCESS")
if [[ -n "$TAG" ]]; then
  PUBLISH_CMD+=(--tag "$TAG")
fi
if [[ "$DRY_RUN" -eq 1 ]]; then
  PUBLISH_CMD+=(--dry-run)
fi

echo "==> Running publish command"
printf '    %q ' "${PUBLISH_CMD[@]}"
echo
"${PUBLISH_CMD[@]}"

echo "==> Done"
