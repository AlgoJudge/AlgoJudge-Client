import { Center, Loader } from "@mantine/core";
import { FC, ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../provider/authContext";

/**
 * Everything behind it needs a session.
 *
 * Three states rather than two. While the session is still being restored the
 * guard waits: sending somebody to the login screen because the answer has not
 * arrived yet would sign them out on every reload.
 *
 * The path being visited travels with the redirect, so signing in returns to
 * where the person was going rather than to a lobby.
 */
const RequireSession: FC<{ children: ReactNode }> = ({ children }) => {
    const { status } = useAuth();
    const location = useLocation();

    // Development convenience, and **only** in development: a production build
    // ignores the flag entirely, so no deployment can be configured into having
    // no authentication at all.
    if (import.meta.env.DEV && import.meta.env.VITE_APP_DEBUG_AUTHENTICATION === "true") {
        return children;
    }

    if (status === "loading") {
        return <Center h="60vh"><Loader /></Center>;
    }

    if (status === "anonymous") {
        return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
    }

    return children;
};

export default RequireSession;
