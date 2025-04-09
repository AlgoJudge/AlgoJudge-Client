import { createContext, FC, ReactNode, useContext, useEffect } from "react";
import { ApiFactory } from "../api/ApiFactory";
import { Api } from "../api/Api";

const ApiContext = createContext<Api|undefined>(undefined);

export const ApiProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const api = ApiFactory.create();
    return (
        <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
    )
}

export const useApi = (): Api => {
    const context = useContext(ApiContext);
    if (!context) throw Error('useApi can only be used insde a SessionProvider');
    return context;
}

export const useApiEffect = (f: (api: Api, signal: AbortSignal) => Promise<void>): void => {
    const api = useApi();
    useEffect(() => {
        const controller = new AbortController();
        f(api, controller.signal);
        return () => controller.abort();
    }, [])
}
