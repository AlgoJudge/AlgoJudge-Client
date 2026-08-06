import { FC, ReactNode, useState } from "react";
import { ApiFactory } from "../api/ApiFactory";
import { Api } from "../api/Api";
import { ApiContext } from "./apiContext";

export const ApiProvider: FC<{ children: ReactNode }> = ({ children }) => {
    // Created once. Recreating it on every render would throw away any state the
    // implementation holds, such as the cached signed-in user.
    const [api] = useState<Api>(() => ApiFactory.create());
    return (
        <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
    )
}
