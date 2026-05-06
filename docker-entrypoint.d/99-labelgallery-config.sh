#!/bin/sh
set -eu

escape_js_string() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

DEFAULT_API_BASE="/api"
DEFAULT_LABEL_PRESETS="74x26,50x50,50x30,50x25,40x30,30x20"
DEFAULT_LABEL_COLORS="white,black,transparent"
DEFAULT_PRINTER_ID=""

API_BASE="$(escape_js_string "${LG_API_BASE:-$DEFAULT_API_BASE}")"
LG_API_UPSTREAM="${LG_API_UPSTREAM:-http://printhub-api:8000}"
LABEL_PRESETS="$(escape_js_string "${LG_LABEL_PRESETS:-$DEFAULT_LABEL_PRESETS}")"
LABEL_COLORS="$(escape_js_string "${LG_LABEL_COLORS:-$DEFAULT_LABEL_COLORS}")"
DEFAULT_PRINTER_ID_VALUE="$(escape_js_string "${LG_DEFAULT_PRINTER_ID:-$DEFAULT_PRINTER_ID}")"

export LG_API_UPSTREAM

if [ -f /etc/nginx/templates/default.conf.template ]; then
  envsubst '${LG_API_UPSTREAM}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
fi

cat > /usr/share/nginx/html/config.js <<EOF
window.LG_API_BASE = "${API_BASE}";
window.LG_LABEL_PRESETS = "${LABEL_PRESETS}";
window.LG_LABEL_COLORS = "${LABEL_COLORS}";
window.LG_DEFAULT_PRINTER_ID = "${DEFAULT_PRINTER_ID_VALUE}";
EOF
