#!/bin/sh
set -eu

API_UPSTREAM="${API_UPSTREAM:-http://127.0.0.1:3001}"
API_HOST="$(printf '%s' "$API_UPSTREAM" | sed -E 's#^https?://##' | cut -d/ -f1)"

export API_UPSTREAM API_HOST
envsubst '${API_UPSTREAM} ${API_HOST}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
