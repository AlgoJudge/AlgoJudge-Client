/**
 * Where the Server's API lives, and the one thing about it that is not
 * configurable.
 *
 * **Every installation serves the API at `/api/v1`, whatever host it is on** —
 * `api.example.com/api/v1` and `example.com/api/v1` alike. Decided 2026-08-06,
 * replacing an arrangement where the prefix was part of the configured address
 * and an installation could choose `api.example.com/v1` instead.
 *
 * The reason is the case where the Client and the Server share a domain. There
 * the API cannot live at the root — the root is the application — so it must
 * live under a path, and a path that is only sometimes there is a path every
 * deployment has to get right separately. Fixing it costs an installation on its
 * own subdomain three characters of URL and removes a whole class of
 * misconfiguration, where the Client asks a correct host for the wrong path and
 * is answered by the SPA's own index.html rather than by an error.
 */
export const API_PATH = "/api/v1";

/** What the container wrote into `index.html` when it started. See `ApiFactory`. */
declare global {
    interface Window { __ALGOJUDGE__?: { apiBaseUrl?: string; useFakeApi?: string } }
}

/**
 * The API's base address, from whatever the operator configured as the origin.
 *
 * An empty result is deliberate and useful: with the Server on the Client's own
 * origin the configured value is `/`, and the base becomes the relative
 * `/api/v1` — which is exactly what a browser should ask for when the two are
 * one deployment.
 */
export const apiBaseUrl = (configured: string): string => {
    const origin = configured.trim()
        .replace(/\/+$/, "")
        // Configured before the path was fixed, in either of the two shapes that
        // used to be allowed. Taken off rather than refused: the operator's
        // intent is unambiguous, and the alternative is a Client that asks for
        // `/v1/api/v1` and reports nothing but a 404.
        .replace(/(\/api)?\/v1$/, "");
    return origin + API_PATH;
};

/**
 * The API's base address as this build is actually configured.
 *
 * `ApiFactory` resolves the same thing to construct the HTTP client, and this is
 * that resolution exported — because one caller cannot go through the API layer
 * at all. **A sign-in through a provider leaves this application**: the browser
 * is sent to the provider and comes back to the Server, so the button needs a
 * real address rather than a method on a client.
 *
 * Empty is the honest answer under the fake and under `npm run dev`, where no
 * origin is configured. A caller that needs a Server has to say what it does
 * with that, rather than build a link to nowhere.
 */
export const resolvedApiBase = (): string => {
    const runtime = typeof window === "undefined" ? undefined : window.__ALGOJUDGE__;
    const configured = (value: string | undefined): string | undefined =>
        value !== undefined && value.trim().length > 0 ? value : undefined;

    const origin = configured(runtime?.apiBaseUrl)
        ?? configured(import.meta.env.VITE_APP_API_BASE_URL);

    return origin ? apiBaseUrl(origin) : "";
};
