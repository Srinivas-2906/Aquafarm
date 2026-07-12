#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-kaana-prod}"
REGION="${GCP_REGION:-asia-south1}"
REPO="${ARTIFACT_REPO:-kaana}"
SQL_INSTANCE="${SQL_INSTANCE:-faralin-pg}"
DB_NAME="${DB_NAME:-aquafarm}"
DB_USER="${DB_USER:-aquafarm}"
SERVICE_API="${SERVICE_API:-aquafarm-api}"
SERVICE_WEB="${SERVICE_WEB:-aquafarm-web}"
DOMAIN_WEB="${DOMAIN_WEB:-aquafarm.kaana.in}"
DOMAIN_API="${DOMAIN_API:-api.aquafarm.kaana.in}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Deploying Aquafarm to ${PROJECT_ID} (${REGION})"

gcloud config set project "$PROJECT_ID" >/dev/null

if ! gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Kaana container images"
fi

API_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE_API}:${IMAGE_TAG}"
WEB_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE_WEB}:${IMAGE_TAG}"

echo "==> Building API image"
cat > /tmp/cloudbuild-aquafarm-api.yaml <<EOF
steps:
- name: 'gcr.io/cloud-builders/docker'
  args: ['build', '-t', '${API_IMAGE}', '-f', 'apps/api/Dockerfile', '.']
images: ['${API_IMAGE}']
EOF
gcloud builds submit --config=/tmp/cloudbuild-aquafarm-api.yaml .

echo "==> Building Web image"
cat > /tmp/cloudbuild-aquafarm-web.yaml <<EOF
steps:
- name: 'gcr.io/cloud-builders/docker'
  args: ['build', '-t', '${WEB_IMAGE}', '-f', 'apps/web/Dockerfile', '.']
images: ['${WEB_IMAGE}']
EOF
gcloud builds submit --config=/tmp/cloudbuild-aquafarm-web.yaml .

if ! gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" >/dev/null 2>&1; then
  echo "==> Creating database ${DB_NAME}"
  gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE"
fi

if ! gcloud sql users list --instance="$SQL_INSTANCE" --format='value(name)' | grep -qx "$DB_USER"; then
  DB_PASSWORD="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)"
  echo "==> Creating DB user ${DB_USER}"
  gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASSWORD"
  DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
  if ! gcloud secrets describe aquafarm_database_url >/dev/null 2>&1; then
    printf '%s' "$DATABASE_URL" | gcloud secrets create aquafarm_database_url --data-file=-
  else
    printf '%s' "$DATABASE_URL" | gcloud secrets versions add aquafarm_database_url --data-file=-
  fi
else
  echo "==> DB user ${DB_USER} already exists (reusing aquafarm_database_url secret)"
fi

for secret in aquafarm_jwt_secret aquafarm_jwt_refresh_secret; do
  if ! gcloud secrets describe "$secret" >/dev/null 2>&1; then
    openssl rand -base64 48 | gcloud secrets create "$secret" --data-file=-
  fi
done

CORS_ORIGIN="https://${DOMAIN_WEB}"
ALLOWED_ORIGINS="${CORS_ORIGIN},https://${DOMAIN_API}"

echo "==> Deploying API (${SERVICE_API})"
gcloud run deploy "$SERVICE_API" \
  --image "$API_IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 3 \
  --add-cloudsql-instances "${PROJECT_ID}:${REGION}:${SQL_INSTANCE}" \
  --set-secrets "DATABASE_URL=aquafarm_database_url:latest,JWT_SECRET=aquafarm_jwt_secret:latest,JWT_REFRESH_SECRET=aquafarm_jwt_refresh_secret:latest" \
  --set-env-vars "NODE_ENV=production,CORS_ORIGIN=${CORS_ORIGIN},COOKIE_SECURE=true,OTP_MOCK_ENABLED=false,API_PORT=8080"

API_URL="$(gcloud run services describe "$SERVICE_API" --region "$REGION" --format='value(status.url)')"

echo "==> Deploying Web (${SERVICE_WEB})"
gcloud run deploy "$SERVICE_WEB" \
  --image "$WEB_IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 256Mi \
  --cpu 1 \
  --max-instances 3 \
  --set-env-vars "API_UPSTREAM=${API_URL}"

WEB_URL="$(gcloud run services describe "$SERVICE_WEB" --region "$REGION" --format='value(status.url)')"

echo "==> Wiring load balancer backends"
for pair in "${SERVICE_API}:${SERVICE_API}-backend:${SERVICE_API}-neg" "${SERVICE_WEB}:${SERVICE_WEB}-backend:${SERVICE_WEB}-neg"; do
  IFS=':' read -r svc backend neg <<<"$pair"
  if ! gcloud compute network-endpoint-groups describe "$neg" --region="$REGION" >/dev/null 2>&1; then
    gcloud compute network-endpoint-groups create "$neg" \
      --region="$REGION" \
      --network-endpoint-type=serverless \
      --cloud-run-service="$svc"
  fi
  if ! gcloud compute backend-services describe "$backend" --global >/dev/null 2>&1; then
    gcloud compute backend-services create "$backend" --global --load-balancing-scheme=EXTERNAL
  fi
  gcloud compute backend-services add-backend "$backend" \
    --global \
    --network-endpoint-group="$neg" \
    --network-endpoint-group-region="$REGION" || true
done

if ! gcloud compute ssl-certificates describe aquafarm-cert >/dev/null 2>&1; then
  gcloud compute ssl-certificates create aquafarm-cert \
    --domains="${DOMAIN_WEB},${DOMAIN_API}" \
    --global
fi

PROXY="$(gcloud compute target-https-proxies describe kaana-web-https-proxy-classic --format='value(name)')"
if ! gcloud compute target-https-proxies describe "$PROXY" --format='value(sslCertificates)' | grep -q aquafarm-cert; then
  EXISTING_CERTS="$(gcloud compute target-https-proxies describe "$PROXY" --format='value(sslCertificates)' | tr ';' '\n' | sed 's|.*/||' | tr '\n' ',' | sed 's/,$//')"
  gcloud compute target-https-proxies update "$PROXY" --ssl-certificates="${EXISTING_CERTS},aquafarm-cert"
fi

URL_MAP="kaana-web-map-multi"
if ! gcloud compute url-maps describe "$URL_MAP" --format=yaml | grep -q "${DOMAIN_WEB}"; then
  gcloud compute url-maps add-path-matcher "$URL_MAP" \
    --path-matcher-name=aquafarm-web \
    --default-service="${SERVICE_WEB}-backend"
  gcloud compute url-maps add-host-rule "$URL_MAP" \
    --hosts="${DOMAIN_WEB}" \
    --path-matcher-name=aquafarm-web
fi

if ! gcloud compute url-maps describe "$URL_MAP" --format=yaml | grep -q "${DOMAIN_API}"; then
  gcloud compute url-maps add-path-matcher "$URL_MAP" \
    --path-matcher-name=aquafarm-api \
    --default-service="${SERVICE_API}-backend"
  gcloud compute url-maps add-host-rule "$URL_MAP" \
    --hosts="${DOMAIN_API}" \
    --path-matcher-name=aquafarm-api
fi

echo "==> Seeding database (one-time, safe to re-run)"
gcloud run jobs describe aquafarm-seed --region "$REGION" >/dev/null 2>&1 || \
gcloud run jobs create aquafarm-seed \
  --image "$API_IMAGE" \
  --region "$REGION" \
  --add-cloudsql-instances "${PROJECT_ID}:${REGION}:${SQL_INSTANCE}" \
  --set-secrets "DATABASE_URL=aquafarm_database_url:latest" \
  --command "tsx" \
  --args "apps/api/prisma/seed.ts" || true

gcloud run jobs execute aquafarm-seed --region "$REGION" --wait || echo "Seed job skipped/failed (may already be seeded)"

cat <<EOF

Deployment complete.

Web (Cloud Run): ${WEB_URL}
API (Cloud Run): ${API_URL}
Custom domain:   https://${DOMAIN_WEB}
API domain:      https://${DOMAIN_API}

DNS for ${DOMAIN_WEB} should point to the Kaana load balancer IP (34.36.130.96).
SSL cert provisioning may take up to 30 minutes on first deploy.

Demo login:
  Owner:      9876543210 / 123456
  Supervisor: 9876543211 / 654321
EOF
