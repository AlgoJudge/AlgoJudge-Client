import { FC, ReactNode, useEffect, useState } from "react";
import { useApi } from "./apiContext";
import { useAuth } from "./authContext";
import { PermissionsContext } from "./permissionsContext";

/**
 * Fetches what the signed-in person holds anywhere, once per session.
 *
 * Tied to the session rather than to a screen: signing out drops the answer, so
 * the next person to sign in on this tab does not inherit a menu built for
 * somebody else.
 */
export const PermissionsProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const api = useApi();
    const { status } = useAuth();
    const [permissions, setPermissions] = useState<string[] | undefined>(undefined);

    useEffect(() => {
        if (status === "loading") return;
        if (status === "anonymous") {
            setPermissions([]);
            return;
        }

        const controller = new AbortController();
        setPermissions(undefined);
        api.managerApi.getMyAccess(controller.signal)
            .then(setPermissions)
            .catch(() => {
                if (controller.signal.aborted) return;
                // An unanswered question is not a permission: a failure hides
                // the manager entries rather than opening them.
                setPermissions([]);
            });
        return () => controller.abort();
    }, [api, status]);

    /*
     * **Readiness, on the document, because otherwise a check cannot tell "may
     * not" from "does not know yet".**
     *
     * Permissions arrive in a request of their own, after the session settles.
     * Until they do, `hasAny` answers false for everything — so a screen looks
     * exactly like one the reader may not open, and an assertion about an
     * absence passes without meaning anything. The browser checks read this the
     * way they already read `data-mantine-color-scheme`, and wait.
     *
     * It says nothing about *what* is permitted, so it discloses nothing.
     */
    useEffect(() => {
        document.documentElement.dataset.permissions =
            permissions === undefined ? "loading" : "ready";
    }, [permissions]);

    const has = (permission: string) => permissions?.includes(permission) ?? false;
    const hasAny = (wanted: readonly string[]) => wanted.some(has);

    return (
        <PermissionsContext.Provider value={{ permissions, has, hasAny, loading: permissions === undefined }}>
            {children}
        </PermissionsContext.Provider>
    );
};
