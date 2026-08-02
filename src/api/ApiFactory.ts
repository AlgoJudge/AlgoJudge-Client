import { Api } from "./Api";
import { FakeApiFactory } from "./fake/FakeApiFactory";
import { HttpApiFactory } from "./http/HttpApiFactory";

export class ApiFactory {
    /**
     * Selects the API implementation.
     *
     * The fake implementation is used when `VITE_APP_USE_FAKE_API` is `true`,
     * or when no Server base URL is configured, so that the interface can be
     * developed against without a running Server. Otherwise the Client talks to
     * the real Server.
     */
    public static create(): Api {
        const baseUrl = import.meta.env.VITE_APP_API_BASE_URL;
        const forceFake = import.meta.env.VITE_APP_USE_FAKE_API === "true";
        if (forceFake || !baseUrl) {
            return FakeApiFactory.create();
        }
        return HttpApiFactory.create(baseUrl);
    }
}
