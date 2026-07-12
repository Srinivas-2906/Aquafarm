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

RUN npm run build -w @aqualedger/config -w @aqualedger/types -w @aqualedger/validation -w @aqualedger/contracts -w @aqualedger/database
RUN npm run db:generate -w @aqualedger/database
RUN npm run build -w @aqualedger/api

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages ./packages

RUN npm install -g tsx@4.19.2

EXPOSE 8080

CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && node dist/main.js"]
