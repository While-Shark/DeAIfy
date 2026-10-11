#!/usr/bin/env bash
set -Eeuo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }
assert_contains() { grep -q -- "$2" "$1" || fail "Missing $2 in $1"; }
make_fixture() {
  local root="$1"
  mkdir -p "$root/scripts"
  cp "$PROJECT_ROOT/scripts/setup.sh" "$PROJECT_ROOT/scripts/setup-lib.sh" "$root/scripts/"
  printf 'name: fixture\n' > "$root/docker-compose.commercial.yml"
}

# A normal new install should require only an API domain; all cryptographic
# tokens and bundled MySQL passwords are generated without printing them.
make_fixture "$TEMP_DIR/bundled"
printf '\nhttps://api.example.test\n\n\n\n\nn\n1\nn\ny\n' | \
  bash "$TEMP_DIR/bundled/scripts/setup.sh" --configure-only > "$TEMP_DIR/bundled.log" 2>&1 \
  || { cat "$TEMP_DIR/bundled.log"; fail 'Bundled MySQL setup'; }
BUNDLED_ENV="$TEMP_DIR/bundled/.env.commercial"
assert_contains "$BUNDLED_ENV" "MYSQL_MODE='bundled'"
assert_contains "$BUNDLED_ENV" "PAYMENTS_ENABLED='false'"
assert_contains "$BUNDLED_ENV" "REGISTRATION_ENABLED='false'"
[[ "$(stat -c %a "$BUNDLED_ENV")" == 600 ]] || fail 'Dotenv is not private'
assert_contains "$TEMP_DIR/bundled/deploy/nginx-location.conf" 'proxy_pass http://127.0.0.1:18088'
# Reading is implemented without eval or Bash-sourcing untrusted dotenv content.
source "$PROJECT_ROOT/scripts/setup-lib.sh"
ENV_FILE="$BUNDLED_ENV"
load_env
[[ "${#CFG[RESULT_ENCRYPTION_KEY_HEX]}" -eq 64 ]] || fail 'Missing encryption key'
[[ "${#CFG[PROCESSOR_SHARED_TOKEN]}" -eq 64 ]] || fail 'Missing processor secret'
FIRST_KEY="${CFG[RESULT_ENCRYPTION_KEY_HEX]}"
FIRST_DB_PASS="${CFG[MYSQL_PASSWORD]}"
[[ -n "$FIRST_DB_PASS" ]] || fail 'No generated DB password'
if grep -q "$FIRST_DB_PASS" "$TEMP_DIR/bundled.log"; then fail 'Secret leaked to setup log'; fi

# Reconfigure must keep all credentials, not clear/recreate a MySQL data volume.
printf '\n\n\n\n\n\nn\n1\nn\ny\n' | \
  bash "$TEMP_DIR/bundled/scripts/setup.sh" --configure-only > "$TEMP_DIR/rerun.log" 2>&1 \
  || { cat "$TEMP_DIR/rerun.log"; fail 'Rerun'; }
CFG=()
load_env
[[ "${CFG[RESULT_ENCRYPTION_KEY_HEX]}" == "$FIRST_KEY" ]] || fail 'Encryption key changed unexpectedly'
[[ "${CFG[MYSQL_PASSWORD]}" == "$FIRST_DB_PASS" ]] || fail 'DB password changed unexpectedly'
find "$TEMP_DIR/bundled" -maxdepth 1 -name '.env.commercial.backup.*' | grep -q . || fail 'Backup missing'

# Existing MySQL with TLS, a password containing special shell/dotenv chars,
# and optional merchant credentials. It must remain payment-disabled.
make_fixture "$TEMP_DIR/external"
cat <<'ANSWERS' | bash "$TEMP_DIR/external/scripts/setup.sh" --configure-only > "$TEMP_DIR/external.log" 2>&1 || { cat "$TEMP_DIR/external.log"; fail 'External MySQL setup'; }

https://api.external.example.test

2
existing_deaify
appuser
db.remote.example.test
3307
pa's$word
1
n
n
1
y
merchant_123
se'cret$very
Y
ANSWERS
ENV_FILE="$TEMP_DIR/external/.env.commercial"
CFG=()
load_env
[[ "${CFG[MYSQL_MODE]}" == external ]] || fail 'Wrong external DB mode'
[[ "${CFG[MYSQL_HOST]}" == db.remote.example.test ]] || fail 'Wrong remote DB host'
[[ "${CFG[MYSQL_SSL_MODE]}" == verify ]] || fail 'Remote MySQL TLS not enabled'
[[ "${CFG[MYSQL_PASSWORD]}" == "pa's\$word" ]] || fail 'Password escaping failed'
[[ "${CFG[XUNHU_SECRET]}" == "se'cret\$very" ]] || fail 'Merchant secret escaping failed'
[[ "${CFG[PAYMENTS_ENABLED]}" == false ]] || fail 'Must never auto-enable live charging'
if grep -q "pa's\$word" "$TEMP_DIR/external.log"; then fail 'DB password leaked'; fi
if grep -q "se'cret\$very" "$TEMP_DIR/external.log"; then fail 'Merchant secret leaked'; fi

# Compose must parse generated credentials with apostrophes and dollar signs.
# No Docker is needed for --configure-only; this check runs only when available.
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  docker compose --env-file "$ENV_FILE" -f "$PROJECT_ROOT/docker-compose.commercial.yml" config --quiet     || fail 'Compose could not parse generated external-MySQL dotenv credentials'
fi

# Invalid origins must fail BEFORE overwriting any existing secrets or files.
cp "$ENV_FILE" "$TEMP_DIR/expected.env"
set +e
printf '\nhttp://unsafe.example.test\n' | bash "$TEMP_DIR/external/scripts/setup.sh" --configure-only > "$TEMP_DIR/invalid.log" 2>&1
status=$?
set -e
[[ $status -ne 0 ]] || fail 'Insecure API origin unexpectedly accepted'
cmp -s "$ENV_FILE" "$TEMP_DIR/expected.env" || fail 'Invalid input rewrote existing config'

echo 'Installer smoke tests passed.'
