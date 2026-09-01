import { FC, ReactNode, useState } from "react";
import { ApiFactory } from "../api/ApiFactory";
import { Api } from "../api/Api";
import { ApiContext } from "./apiContext";

/**
 * Said in plain markup, in English, on purpose.
 *
 * This provider sits **above** `MantineProvider` and above the instance whose
 * colours the theme is built from, so no themed component is available here and
 * nothing can be fetched to fill the page in. And the person who sees it is the
 * operator who started the container, not a participant: what they need is the
 * name of the variable and the fact that nothing else on this screen is real.
 */
const NotConfigured: FC<{ problem: string }> = ({ problem }) => (
    <main style={{
        maxWidth: "34rem", margin: "4rem auto", padding: "0 1rem",
        fontFamily: "system-ui, sans-serif", lineHeight: 1.5,
    }}>
        <h1 style={{ fontSize: "1.25rem" }}>This installation is not configured</h1>
        <p>{problem}</p>
        <p>
            Set it on the Client container and start it again. Until then this
            application cannot reach a Server, and it will not stand in a
            demonstration for one.
        </p>
    </main>
);

export const ApiProvider: FC<{ children: ReactNode }> = ({ children }) => {
    // Created once. Recreating it on every render would throw away any state the
    // implementation holds, such as the cached signed-in user.
    //
    // **One hook, both outcomes.** The refusal cannot be an early return above a
    // second `useState`: hooks are called unconditionally or not at all.
    const [resolved] = useState<{ problem: string } | { api: Api }>(() => {
        const problem = ApiFactory.misconfiguration();
        return problem !== undefined ? { problem } : { api: ApiFactory.create() };
    });

    if ("problem" in resolved) return <NotConfigured problem={resolved.problem} />;

    return (
        <ApiContext.Provider value={resolved.api}>{children}</ApiContext.Provider>
    )
}
