import { createContext, DependencyList, useCallback, useContext, useEffect, useState } from "react";
import { Api } from "../api/Api";
import { ForbiddenError } from "../api/ApiError";
import { ScopedApi } from "../api/ScopedApi";
import { useConnectionGeneration } from "./connectionContext";

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
    // A reconnected socket replays nothing, so whatever this effect fetched
    // while the connection was down may have moved. Carried here rather than at
    // the call sites: every one of them wants it, and none of them should have
    // to remember. Zero and unchanging until something is actually lost.
    const generation = useConnectionGeneration();
    // Silenced here because here is the one place nothing can go wrong. The list
    // is a parameter rather than a literal, so the rule stops at the wrapper —
    // and what it asks for instead would break the application: `api` is created
    // once for its whole life, and `f` is a new arrow on every render, so
    // listing it would run the effect on every render, and every one of these
    // effects sets state.
    //
    // What the rule cannot see from here is checked where it matters, by
    // `npm run lint:deps`: the dependency list every screen declares.
    /* eslint-disable react-hooks/exhaustive-deps */
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
        // Spread rather than passed through: React compares the entries, not the
        // array, so building a new one each render costs nothing.
    }, [...deps, generation]);
    /* eslint-enable react-hooks/exhaustive-deps */
    return error;
}

/**
 * One load whose refusal must not take the screen with it.
 *
 * **A convenience is not a dependency.** A screen's effect awaits its loads in
 * one sequence, so the first refusal skips every load after it and `loadError`
 * replaces the whole page. The grant editor asks for the permission templates
 * and the account list to fill two pickers with; a manager holds neither
 * `template:read` nor `user:read:all`, so both answer 403 — and the Participants
 * tab died on the first of them while the roster it exists to show, which the
 * same account may read perfectly well, was never even requested.
 *
 * Only 403 is absorbed. A network failure, a 500 or an aborted read still take
 * the screen down, because those are not answers about what somebody may see.
 *
 * @param load the request, already started
 * @param fallback what the screen shows instead — an empty picker, not no page
 */
export async function optional<T>(load: Promise<T>, fallback: T): Promise<T> {
    try {
        return await load;
    } catch (error) {
        if (error instanceof ForbiddenError) return fallback;
        throw error;
    }
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
