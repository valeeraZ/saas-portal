FROM node:24.10.0-bookworm-slim@sha256:b8d2197aff9129d16c801a3e3e1b2a873c4946480f5a310f38056df2268c38d9 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci
COPY . .
RUN npm run build

FROM node:24.10.0-bookworm-slim@sha256:b8d2197aff9129d16c801a3e3e1b2a873c4946480f5a310f38056df2268c38d9
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORTAL_BIND_HOST=0.0.0.0 PORT=3000
ENV HOME=/tmp XDG_CACHE_HOME=/tmp/cache SWC_NATIVE_BINDING_CACHE=/tmp/swc
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
# The custom response-protection entry is required; do not replace with next start.
CMD ["node", "server.ts"]
