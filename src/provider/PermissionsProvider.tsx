import { FC, ReactNode, useEffect, useState } from "react";
import { useApi } from "./ApiProvider";
import { useAuth } from "./AuthProvider";
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

    const has = (permission: string) => permissions?.includes(permission) ?? false;
    const hasAny = (wanted: readonly string[]) => wanted.some(has);

    return (
        <PermissionsContext.Provider value={{ permissions, has, hasAny, loading: permissions === undefined }}>
            {children}
        </PermissionsContext.Provider>
    );
};
