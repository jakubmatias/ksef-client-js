#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-latest}"
REPO="${KSEF_REPO:-jakubmatias/ksef-client-js}"
FILENAME="ksef-macos.zip"
BASE_URL="https://github.com/${REPO}/releases"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 1
fi
if ! command -v unzip >/dev/null 2>&1; then
  echo "unzip is required." >&2
  exit 1
fi
if ! command -v shasum >/dev/null 2>&1; then
  echo "shasum is required." >&2
  exit 1
fi

if [[ "${VERSION}" == "latest" ]]; then
  DOWNLOAD_URL="${BASE_URL}/latest/download/${FILENAME}"
else
  DOWNLOAD_URL="${BASE_URL}/download/v${VERSION}/${FILENAME}"
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

CHECKSUMS_URL="${BASE_URL}/latest/download/checksums.sha256"
if [[ "${VERSION}" != "latest" ]]; then
  CHECKSUMS_URL="${BASE_URL}/download/v${VERSION}/checksums.sha256"
fi

curl -fsSL "${DOWNLOAD_URL}" -o "${TMP_DIR}/ksef.zip"
curl -fsSL "${CHECKSUMS_URL}" -o "${TMP_DIR}/checksums.sha256"

(
  cd "${TMP_DIR}"
  shasum -a 256 -c checksums.sha256 --ignore-missing
)
unzip -q "${TMP_DIR}/ksef.zip" -d "${TMP_DIR}"
chmod +x "${TMP_DIR}/ksef-macos"

DEST="/usr/local/bin/ksef"
if mv "${TMP_DIR}/ksef-macos" "${DEST}" 2>/dev/null; then
  echo "Installed ksef to ${DEST}"
else
  echo "Installing to ${DEST} requires sudo."
  sudo mv "${TMP_DIR}/ksef-macos" "${DEST}"
  echo "Installed ksef to ${DEST}"
fi
