import { createContext, DependencyList, FC, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { ApiFactory } from "../api/ApiFactory";
import { Api } from "../api/Api";
import { ScopedApi } from "../api/ScopedApi";

const ApiContext = createContext<Api | undefined>(undefined);

export const ApiProvider: FC<{ children: ReactNode }> = ({ children }) => {
    // Created once. Recreating it on every render would throw away any state the
    // implementation holds, such as the cached signed-in user.
    const [api] = useState<Api>(() => ApiFactory.create());
    return (
        <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
    )
}

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
