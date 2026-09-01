import { Api } from "./Api";
import { FakeApiFactory } from "./fake/FakeApiFactory";
import { apiBaseUrl } from "./http/apiBase";
import { HttpApiFactory } from "./http/HttpApiFactory";

/**
 * What the container wrote into `index.html` when it started — one image per
 * installation, configured at start rather than at build (decided 2026-08-03).
 *
 * The shape and the `Window` augmentation live in `http/apiBase.ts`, beside the
 * other place that resolves this value: the sign-in buttons leave the
 * application entirely, so they cannot go through the API layer and need the
 * address on their own. Two declarations of one global would be two places to
 * change it.
 */

// The  augmentation lives in , beside the other
// resolution of this value — two declarations of one global is two places to
// change it.

/**
 * A configured value, or nothing.
 *
 * `envsubst` leaves an unset variable as the empty string, so "" and absent are
 * the same answer here: not configured. Without this an image started without
 * `API_BASE_URL` would be handed `""` and treat it as an origin.
 */
const configured = (value: string | undefined): string | undefined =>
    value !== undefined && value.trim().length > 0 ? value.trim() : undefined;

export class ApiFactory {
    /**
     * Selects the API implementation.
     *
     * The fake implementation is used when the API is forced to it, or when no
     * Server origin is configured, so that the interface can be developed
     * against without a running Server. Otherwise the Client talks to the real
     * Server.
     *
     * The origin is read from the **runtime** configuration first and from
     * `import.meta.env` second. Runtime wins because it is the one an operator
     * can change; the build-time value stays for `npm run dev`, which has no
     * container to configure it.
     *
     * It names an **origin**, not a base URL: the path is always `/api/v1` and
     * the Client appends it. `/` means the origin this application is served
     * from, which is how one domain serving both is configured.
     */
    public static create(): Api {
        const runtime = typeof window === "undefined" ? undefined : window.__ALGOJUDGE__;

        const origin = configured(runtime?.apiBaseUrl)
            ?? configured(import.meta.env.VITE_APP_API_BASE_URL);
        const forceFake = (configured(runtime?.useFakeApi)
            ?? configured(import.meta.env.VITE_APP_USE_FAKE_API)) === "true";

        if (forceFake || !origin) {
            return FakeApiFactory.create();
        }
        return HttpApiFactory.create(apiBaseUrl(origin));
    }

    /**
     * Why this Client cannot reach a Server, where that is a configuration
     * error rather than a choice. `undefined` when there is no such error.
     *
     * **An empty `apiBaseUrl` in a substituted placeholder is a broken
     * deployment.** `docker-entrypoint.sh` defaults `API_BASE_URL` to the empty
     * string, so an image started without it writes
     * `{"apiBaseUrl":"","useFakeApi":"false"}` into `index.html` — and
     * {@link create} reads that as "no origin", falls through to the fake and
     * serves a complete invented installation, with invented people and invented
     * contests, to somebody who believes they are looking at their own. Opening
     * into fiction is a worse failure than refusing to open.
     *
     * **The placeholder is what tells that apart from development.** A
     * substituted one carries the key whatever its value; the one this
     * repository ships is `{}`, which is `npm run dev` reading
     * `import.meta.env` — and that still gets the fake, deliberately.
     */
    public static misconfiguration(): string | undefined {
        const runtime = typeof window === "undefined" ? undefined : window.__ALGOJUDGE__;

        if (runtime === undefined || !("apiBaseUrl" in runtime)) return undefined;
        if (configured(runtime.apiBaseUrl) !== undefined) return undefined;
        // Asking for the fake is still allowed, because it was asked for.
        if (configured(runtime.useFakeApi) === "true") return undefined;

        return "API_BASE_URL is empty on this Client container.";
    }
}
