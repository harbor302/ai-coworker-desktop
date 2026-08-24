#!/bin/bash
# scripts/build-local.sh — Local build script for Coworker
#
# Usage:
#   npm run build:local                  # Auto-detect platform, build DMG/EXE
#   npm run build:local -- --mac         # Force macOS DMG build
#   npm run build:local -- --win         # Force Windows EXE build
#   npm run build:local -- --clean       # Clean before building
#   npm run build:local -- --skip-check  # Skip pre-build checks
#
# Outputs:
#   macOS:   release/Coworker-<version>-mac-arm64.dmg
#   Windows: release/Coworker Setup <version>.exe

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}==>${NC} $*"; }
ok()    { echo -e "${GREEN}  OK${NC} $*"; }
warn()  { echo -e "${YELLOW}  !!${NC} $*"; }
error() { echo -e "${RED}  ✗${NC} $*"; }

# --- Parse args ---
PLATFORM=""
SKIP_CHECK=false
CLEAN=false

for arg in "$@"; do
  case "$arg" in
    --mac)         PLATFORM="mac" ;;
    --win)         PLATFORM="win" ;;
    --all)         PLATFORM="all" ;;
    --skip-check)  SKIP_CHECK=true ;;
    --clean)       CLEAN=true ;;
    *)             warn "Unknown argument: $arg" ;;
  esac
done

# Auto-detect platform
if [ -z "$PLATFORM" ]; then
  case "$(uname -s)" in
    Darwin) PLATFORM="mac" ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT) PLATFORM="win" ;;
    Linux)  PLATFORM="mac" ; warn "Linux detected — building macOS targets (no Linux installer configured)" ;;
    *)      error "Unsupported OS: $(uname -s)"; exit 1 ;;
  esac
fi

cd "$PROJECT_ROOT"

# --- Pre-build checks ---
if [ "$SKIP_CHECK" = false ]; then
  info "Running pre-build checks..."

  # Node version
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -lt 22 ]; then
    error "Node.js >= 22 required (current: $(node -v))"
    exit 1
  fi
  ok "Node.js $(node -v)"

  # node_modules
  if [ ! -d "node_modules" ]; then
    info "Installing dependencies..."
    npm ci
  fi
  ok "node_modules present"

  # electron-builder
  if ! npx electron-builder --version >/dev/null 2>&1; then
    error "electron-builder not found. Run: npm ci"
    exit 1
  fi
  ok "electron-builder $(npx electron-builder --version 2>/dev/null)"
fi

# --- Clean ---
if [ "$CLEAN" = true ]; then
  info "Cleaning build artifacts..."
  npm run clean
  ok "Clean complete"
fi

# --- Build ---
VERSION=$(node -e "console.log(require('./package.json').version)")

build_mac() {
  info "Building macOS DMG (arm64)..."

  # Full build pipeline
  npm run download:node
  npm run prepare:gui-tools 2>/dev/null || true
  npm run prepare:python:all 2>/dev/null || true
  npm run build:lima-agent
  npm run build:mcp
  npx tsc
  npx vite build
  node scripts/pre-build-check.js

  # Package (unsigned for local builds)
  CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg dir --publish never

  # Report
  echo ""
  info "${BOLD}macOS build complete!${NC}"
  echo ""

  DMG_FILE=$(find release -maxdepth 1 -name "*.dmg" -type f 2>/dev/null | head -1)
  APP_DIR="release/mac-arm64"

  if [ -n "$DMG_FILE" ]; then
    echo -e "  DMG:  ${GREEN}${DMG_FILE}${NC}"
    DMG_SIZE=$(du -h "$DMG_FILE" | cut -f1 | xargs)
    echo -e "  Size: ${DMG_SIZE}"
  fi

  APP_NAME=$(ls "$APP_DIR" 2>/dev/null | grep '\.app$' | head -1)
  if [ -n "$APP_NAME" ]; then
    echo -e "  App:  ${GREEN}${APP_DIR}/${APP_NAME}${NC}"
  fi

  # Optionally install locally on macOS
  if [ "$PLATFORM" = "mac" ] && [ -d "/Applications" ]; then
    echo ""
    read -p "Install to /Applications? [y/N] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      TARGET="/Applications/${APP_NAME}"
      if [ -d "$TARGET" ]; then
        info "Removing old installation..."
        rm -rf "$TARGET"
      fi
      cp -R "${APP_DIR}/${APP_NAME}" "$TARGET"
      xattr -rd com.apple.quarantine "$TARGET" 2>/dev/null || true
      ok "Installed to ${TARGET}"
    fi
  fi
}

build_win() {
  info "Building Windows EXE (x64)..."

  npm run download:node
  npm run build:wsl-agent
  npm run build:mcp
  npx tsc
  npx vite build
  node scripts/pre-build-check.js

  npx electron-builder --win nsis --publish never

  # Report
  echo ""
  info "${BOLD}Windows build complete!${NC}"
  echo ""

  EXE_FILE=$(find release -maxdepth 1 -name "*.exe" -type f 2>/dev/null | head -1)
  if [ -n "$EXE_FILE" ]; then
    echo -e "  EXE:  ${GREEN}${EXE_FILE}${NC}"
    EXE_SIZE=$(du -h "$EXE_FILE" | cut -f1 | xargs)
    echo -e "  Size: ${EXE_SIZE}"
  fi
}

echo ""
info "${BOLD}Coworker v${VERSION} — Local Build${NC}"
info "Platform: ${PLATFORM}"
echo ""

START_TIME=$(date +%s)

case "$PLATFORM" in
  mac) build_mac ;;
  win) build_win ;;
  all) build_mac; build_win ;;
esac

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
info "${BOLD}Total build time: ${ELAPSED}s${NC}"
