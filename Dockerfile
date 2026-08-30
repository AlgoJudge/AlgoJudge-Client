# Build the static bundle, then serve it from nginx. The result is a static
# site: there is no Node.js runtime in the final image.

# `.nvmrc` is where the Node version is decided; a FROM cannot read it, so this
# is the one deliberate second copy. Keep the two on the same major.
FROM node:24-alpine AS build
WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Left empty on purpose. Vite inlines VITE_-prefixed values at build time, so
# anything set here is baked in and binds the image to one installation — which
# is what the entrypoint exists to avoid. Set API_BASE_URL on the **container**
# instead; these stay only so a build can still pin a value if somebody wants
# one, and because `npm run dev` reads them.
#
# Nothing here may hold a secret: everything ends up readable in the browser.
ARG VITE_APP_API_BASE_URL=""
ARG VITE_APP_USE_FAKE_API="false"
ENV VITE_APP_API_BASE_URL=$VITE_APP_API_BASE_URL
ENV VITE_APP_USE_FAKE_API=$VITE_APP_USE_FAKE_API

RUN npm run build

FROM nginx:1.27-alpine AS final

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html

# One image, configured when it starts: the entrypoint writes API_BASE_URL into
# the bundle before nginx serves it. See `docker-entrypoint.sh`.
COPY docker-entrypoint.sh /algojudge-entrypoint.sh
RUN chmod +x /algojudge-entrypoint.sh

ENV API_BASE_URL=""
ENV USE_FAKE_API="false"

EXPOSE 80

# **127.0.0.1, not `localhost`.** In this image `localhost` resolves to `::1`
# alone — there is no IPv4 entry in `/etc/hosts` — and nginx's `listen 80;`
# binds IPv4 only, so the probe asked an address nothing was on: every container
# reported unhealthy while serving perfectly, and `docker compose --wait` failed
# on a stack that was up. That is how this was found.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1

ENTRYPOINT ["/algojudge-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
