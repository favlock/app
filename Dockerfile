# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:alpine

FROM ${NODE_IMAGE} AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY dashboard/package.json dashboard/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --include=optional

COPY tsconfig.json ./
COPY dashboard dashboard
COPY packages/shared packages/shared

ARG VITE_WEB_URL
ARG VITE_DASHBOARD_URL
ARG VITE_API_URL
ARG VITE_CHROME_EXTENSION_URL
ARG VITE_CHROME_EXTENSION_ID
ARG VITE_AUTH_URL
ARG VITE_TURNSTILE_SITE_KEY
ARG VITE_CREEM_PRO_PRODUCT_URL

ENV VITE_WEB_URL=${VITE_WEB_URL}
ENV VITE_DASHBOARD_URL=${VITE_DASHBOARD_URL}
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_CHROME_EXTENSION_URL=${VITE_CHROME_EXTENSION_URL}
ENV VITE_CHROME_EXTENSION_ID=${VITE_CHROME_EXTENSION_ID}
ENV VITE_AUTH_URL=${VITE_AUTH_URL}
ENV VITE_TURNSTILE_SITE_KEY=${VITE_TURNSTILE_SITE_KEY}
ENV VITE_CREEM_PRO_PRODUCT_URL=${VITE_CREEM_PRO_PRODUCT_URL}

RUN npm run build

FROM ${NGINX_IMAGE} AS dashboard

COPY docker/dashboard.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dashboard/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1
