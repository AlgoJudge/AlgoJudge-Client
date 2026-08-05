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
const RequirePermission: FC<{ permissions: string[]; children: ReactNode }> = ({ permissions, children }) => {
    const { hasAny, loading } = usePermissions();

    if (loading) return <Center h="60vh"><Loader /></Center>;
    if (permissions.length > 0 && !hasAny(permissions)) return <ForbiddenPage permissions={permissions} />;
    return children;
};

export default RequirePermission;
