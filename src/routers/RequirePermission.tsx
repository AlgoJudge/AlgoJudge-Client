import { Center, Loader } from "@mantine/core";
import { FC, ReactNode } from "react";
import ForbiddenPage from "../pages/error/ForbiddenPage";
import { usePermissions } from "../provider/permissionsContext";

/**
 * Everything behind it needs one of the named permissions.
 *
 * Sits inside `RequireSession`: the first asks whether anybody is signed in, this
 * one asks whether that person may be here. Both are courtesy — the Server
 * refuses regardless — but a screen that draws itself and then fills with failed
 * requests is a worse answer than one that says why.
 *
 * Waits while the answer is unknown, for the same reason the session guard does:
 * refusing before the permissions have arrived would show a 403 on every reload.
 */
const RequirePermission: FC<{
    permissions: string[];
    /** Held at system scope rather than anywhere — see `ManagerArea.systemScope`. */
    systemScope?: boolean;
    children: ReactNode;
}> = ({ permissions, systemScope, children }) => {
    const { hasAny, hasAtSystemScope, loading } = usePermissions();

    if (loading) return <Center h="60vh"><Loader /></Center>;
    const admitted = systemScope ? permissions.some(hasAtSystemScope) : hasAny(permissions);
    if (permissions.length > 0 && !admitted) return <ForbiddenPage permissions={permissions} />;
    return children;
};

export default RequirePermission;
