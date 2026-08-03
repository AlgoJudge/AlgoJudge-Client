# Build the static bundle, then serve it from nginx. The result is a static
# site: there is no Node.js runtime in the final image.

FROM node:22-alpine AS build
WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_-prefixed values at build time, so they are baked into the
# bundle and cannot be changed by the running container. That also means none of
# them may hold a secret - everything here ends up readable in the browser.
# Build a separate image per environment, or set these at build time.
ARG VITE_APP_API_BASE_URL=""
ARG VITE_APP_USE_FAKE_API="false"
ENV VITE_APP_API_BASE_URL=$VITE_APP_API_BASE_URL
ENV VITE_APP_USE_FAKE_API=$VITE_APP_USE_FAKE_API

RUN npm run build

FROM nginx:1.27-alpine AS final

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1
