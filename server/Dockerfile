FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
 && mkdir -p /data/results \
 && chown -R node:node /app /data/results
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 8080 8081
CMD ["node","dist/index.js"]
