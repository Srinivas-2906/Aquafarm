FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/validation/package.json ./packages/validation/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/database/package.json ./packages/database/

RUN npm ci

COPY . .

RUN npm run build -w @aqualedger/config -w @aqualedger/types -w @aqualedger/validation -w @aqualedger/contracts
ENV VITE_API_URL=/api
RUN npm run build -w @aqualedger/web

FROM nginx:1.27-alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
ENV API_UPSTREAM=http://127.0.0.1:3001
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "envsubst '$API_UPSTREAM' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
