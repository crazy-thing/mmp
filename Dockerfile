# MMP: API + admin panel + file storage in one image. All state lives in /data.
#   docker build -t crazything1/mmp .
#   docker run -p 8080:8080 -v mmp-data:/data crazything1/mmp

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/schema/package.json packages/schema/
COPY packages/importers/package.json packages/importers/
COPY apps/server/package.json apps/server/
COPY apps/panel/package.json apps/panel/
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=8080
COPY package.json package-lock.json ./
COPY packages/schema/package.json packages/schema/
COPY packages/importers/package.json packages/importers/
COPY apps/server/package.json apps/server/
COPY apps/panel/package.json apps/panel/
RUN npm ci --omit=dev --workspace @mmp/server && npm cache clean --force
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/drizzle apps/server/drizzle
COPY --from=build /app/apps/panel/dist apps/panel/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/index.js"]
