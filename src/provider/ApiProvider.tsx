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

/** Runs an API call in an effect and aborts it when the component unmounts. */
export const useApiEffect = (f: (api: ScopedApi) => Promise<void>, deps: DependencyList = []): void => {
    const api = useApi();
    useEffect(() => {
        const controller = new AbortController();
        f(new ScopedApi(api, controller.signal));
        return () => controller.abort();
    }, deps);
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
