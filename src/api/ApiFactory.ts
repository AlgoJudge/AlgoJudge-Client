import { Api } from "./Api";
import { FakeApiFactory } from "./fake/FakeApiFactory";
import { apiBaseUrl } from "./http/apiBase";
import { HttpApiFactory } from "./http/HttpApiFactory";

export class ApiFactory {
    /**
     * Selects the API implementation.
     *
     * The fake implementation is used when `VITE_APP_USE_FAKE_API` is `true`,
     * or when no Server origin is configured, so that the interface can be
     * developed against without a running Server. Otherwise the Client talks to
     * the real Server.
     *
     * `VITE_APP_API_BASE_URL` names an **origin**, not a base URL: the path is
     * always `/api/v1` and the Client appends it. `/` means the origin this
     * application is served from, which is how one domain serving both is
     * configured.
     */
    public static create(): Api {
        const origin = import.meta.env.VITE_APP_API_BASE_URL;
        const forceFake = import.meta.env.VITE_APP_USE_FAKE_API === "true";
        if (forceFake || !origin) {
            return FakeApiFactory.create();
        }
        return HttpApiFactory.create(apiBaseUrl(origin));
    }
}
