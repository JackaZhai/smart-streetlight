FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY mock-device/package.json mock-device/package.json
RUN npm ci

COPY backend/tsconfig.json backend/tsconfig.json
COPY backend/src backend/src
RUN npm --workspace backend run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY mock-device/package.json mock-device/package.json
RUN npm ci --omit=dev

COPY --from=build /app/backend/dist backend/dist

EXPOSE 4000
CMD ["npm", "--workspace", "backend", "run", "start"]
