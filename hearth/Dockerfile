ARG BUILD_FROM

# Build the UI with Node (output is plain static files, so the build arch doesn't matter).
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM ${BUILD_FROM}
ARG BUILD_ARCH
ARG BUILD_VERSION
LABEL io.hass.type="addon" io.hass.arch="${BUILD_ARCH}" io.hass.version="${BUILD_VERSION}"
RUN apk add --no-cache nodejs
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server ./server
COPY package.json ./
COPY run.sh /run.sh
RUN chmod a+x /run.sh
CMD ["/run.sh"]
