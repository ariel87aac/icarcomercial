FROM node:24.20.0-alpine AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24.20.0-alpine AS build

WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:24.20.0-alpine AS production-dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24.20.0-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY scripts ./scripts

USER node
EXPOSE 3000

CMD ["sh", "-c", "npm run migration:run && node dist/main.js"]
