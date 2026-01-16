#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ROOT_DIR}/.env"
  set +a
fi

if [[ -z "${KSEF_NIP:-}" ]]; then
  echo "Missing KSEF_NIP in environment or .env" >&2
  exit 1
fi

cleanup_paths=()
cleanup() {
  for path in "${cleanup_paths[@]}"; do
    rm -f "${path}"
  done
}
trap cleanup EXIT

CERT_FILE="${KSEF_CERT_PEM_PATH:-}"
KEY_FILE="${KSEF_KEY_PEM_PATH:-}"

if [[ -n "${KSEF_CERT_PEM:-}" && -n "${KSEF_KEY_PEM:-}" ]]; then
  CERT_FILE="$(mktemp)"
  KEY_FILE="$(mktemp)"
  printf '%b' "${KSEF_CERT_PEM}" > "${CERT_FILE}"
  printf '%b' "${KSEF_KEY_PEM}" > "${KEY_FILE}"
  cleanup_paths+=("${CERT_FILE}" "${KEY_FILE}")
fi

if [[ -z "${CERT_FILE}" || -z "${KEY_FILE}" ]]; then
  echo "Provide KSEF_CERT_PEM/KSEF_KEY_PEM or KSEF_CERT_PEM_PATH/KSEF_KEY_PEM_PATH" >&2
  exit 1
fi

CONFIG_PATH="$(mktemp)"
cleanup_paths+=("${CONFIG_PATH}")

KSEF_BIN="${KSEF_BIN:-}"
KSEF_ENTRY=""

if [[ -z "${KSEF_BIN}" ]]; then
  if [[ -x "${ROOT_DIR}/bin/ksef" ]]; then
    if [[ "${ROOT_DIR}/bin/ksef" -ot "${ROOT_DIR}/src/cli.ts" ]]; then
      KSEF_BIN="bun"
      KSEF_ENTRY="${ROOT_DIR}/src/cli.ts"
    else
      KSEF_BIN="${ROOT_DIR}/bin/ksef"
    fi
  elif [[ -f "${ROOT_DIR}/dist/cli.js" ]]; then
    KSEF_BIN="node"
    KSEF_ENTRY="${ROOT_DIR}/dist/cli.js"
  else
    KSEF_BIN="bun"
    KSEF_ENTRY="${ROOT_DIR}/src/cli.ts"
  fi
fi

run_ksef() {
  if [[ -n "${KSEF_ENTRY}" ]]; then
    "${KSEF_BIN}" "${KSEF_ENTRY}" "$@"
  else
    "${KSEF_BIN}" "$@"
  fi
}
KSEF_ARGS=(--format json --silent --config "${CONFIG_PATH}")
if [[ -n "${KSEF_BASE_URL:-}" ]]; then
  KSEF_ARGS+=(--base-url "${KSEF_BASE_URL}")
fi

AUTH_ARGS=(auth login -c "${CERT_FILE}" --private-key "${KEY_FILE}" --cert-format pem --nip "${KSEF_NIP}")
if [[ -n "${KSEF_KEY_PASSPHRASE:-}" ]]; then
  AUTH_ARGS+=(-p "${KSEF_KEY_PASSPHRASE}")
fi

auth_attempts=0
max_auth_attempts=6
auth_delay_seconds=3
auth_success=0

while [[ "${auth_attempts}" -lt "${max_auth_attempts}" ]]; do
  auth_attempts=$((auth_attempts + 1))
  set +e
  AUTH_OUTPUT="$(run_ksef "${KSEF_ARGS[@]}" "${AUTH_ARGS[@]}" 2>&1)"
  AUTH_STATUS=$?
  set -e

  if [[ "${AUTH_STATUS}" -eq 0 ]]; then
    auth_success=1
    break
  fi

  if echo "${AUTH_OUTPUT}" | grep -q "Uwierzytelnianie w toku"; then
    sleep "${auth_delay_seconds}"
    continue
  fi

  echo "${AUTH_OUTPUT}" >&2
  break
done

if [[ "${auth_success}" -ne 1 ]]; then
  echo "Authentication failed after ${auth_attempts} attempt(s)." >&2
  exit 1
fi

SESSION_JSON="$(run_ksef "${KSEF_ARGS[@]}" session open online -n "${KSEF_NIP}" --schema "FA (3)")"
SESSION_ID="$(
  printf '%s' "${SESSION_JSON}" \
    | sed -nE 's/.*sessionId"?[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' \
    | head -n 1
)"
if [[ -z "${SESSION_ID}" ]]; then
  SESSION_ID="$(
    printf '%s' "${SESSION_JSON}" \
      | sed -nE 's/.*session opened: ([A-Z0-9-]+).*/\1/p' \
      | head -n 1
  )"
fi

if [[ -z "${SESSION_ID}" ]]; then
  echo "Failed to parse sessionId from session open response." >&2
  exit 1
fi

INVOICE_SOURCE="${ROOT_DIR}/examples/invoice-fa3.json"
INVOICE_JSON="$(mktemp)"
cleanup_paths+=("${INVOICE_JSON}")

node -e 'const fs=require("fs");const src=process.argv[1];const dst=process.argv[2];const data=JSON.parse(fs.readFileSync(src,"utf8"));const stamp=Date.now();if(Array.isArray(data.invoices)){data.invoices.forEach((inv,idx)=>{if(inv.Faktura&&inv.Faktura.Fa&&inv.Faktura.Fa.P_2){inv.Faktura.Fa.P_2=`${inv.Faktura.Fa.P_2}-${stamp}-${idx+1}`}})}fs.writeFileSync(dst, JSON.stringify(data,null,2));' "${INVOICE_SOURCE}" "${INVOICE_JSON}"

run_ksef "${KSEF_ARGS[@]}" invoice submit "${SESSION_ID}" \
  -i "${INVOICE_JSON}" \
  --wait-status \
  --require-success

run_ksef "${KSEF_ARGS[@]}" session close "${SESSION_ID}"

echo "Done. Invoice UPO files are saved as: ksef-invoice-upo-<referenceNumber>.xml"
