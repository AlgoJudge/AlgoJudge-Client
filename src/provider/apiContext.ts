import { createContext, DependencyList, useCallback, useContext, useEffect, useState } from "react";
import { Api } from "../api/Api";
import { ScopedApi } from "../api/ScopedApi";

/**
 * The API context and the three hooks that read it, apart from the component
 * that provides it.
 *
 * Two files rather than one because a module exporting both a component and a
 * plain function cannot be hot-swapped: editing it reloads the whole page and
 * throws away whatever the person was in the middle of typing. Same split as
 * `instanceContext` and `permissionsContext`.
 */

export const ApiContext = createContext<Api | undefined>(undefined);

export const useApi = (): Api => {
    const context = useContext(ApiContext);
    if (!context) throw Error('useApi can only be used inside an ApiProvider');
    return context;
}

/**
 * Runs an API call in an effect, aborts it when the component unmounts, and
 * returns whatever it failed with.
 *
 * The rejection has to come back out. A screen that only knows "the data is not
 * here yet" shows a spinner, and a failed request leaves it spinning for ever —
 * which is what a 404 looks like from the outside.
 */
export const useApiEffect = (f: (api: ScopedApi) => Promise<void>, deps: DependencyList = []): unknown => {
    const api = useApi();
    const [error, setError] = useState<unknown>(undefined);
    // Two lint warnings live on the next line and both are meant to stay.
    //
    // The list is a parameter rather than a literal, so the rule cannot verify
    // it — the price of having a wrapper at all. `npm run lint:deps` checks the
    // call sites instead, which is where a wrong list would actually hurt.
    //
    // `api` and `f` are absent on purpose. `api` is created once and never
    // changes. `f` is a new arrow on every render, so listing it would run the
    // effect on every render — and every one of these effects sets state, which
    // renders again. Neither is a defect to be tidied away.
    useEffect(() => {
        const controller = new AbortController();
        setError(undefined);
        f(new ScopedApi(api, controller.signal)).catch((reason: unknown) => {
            // Unmounting cancels in flight requests on purpose; that is not a
            // failure and there is no longer anything to show it on.
            if (controller.signal.aborted) return;
            setError(reason ?? new Error("Request failed"));
        });
        return () => controller.abort();
    }, deps);
    return error;
}

/**
 * Runs an API call from an event handler. Each invocation gets its own
 * AbortController, so a call started by one interaction never cancels another.
 */
export const useApiCall = (): (<T>(f: (api: ScopedApi) => Promise<T>) => Promise<T>) => {
    const api = useApi();
    return useCallback(<T,>(f: (scoped: ScopedApi) => Promise<T>): Promise<T> => {
        const controller = new AbortController();
        return f(new ScopedApi(api, controller.signal));
    }, [api]);
}
