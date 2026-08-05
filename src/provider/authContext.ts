import { createContext, useContext } from "react";
import { Session } from "../api/CoreApi";

/**
 * Who is signed in, for the whole application.
 *
 * `status` distinguishes "not signed in" from "not known yet". Without that
 * difference the route guard would bounce every reload to the login screen
 * before the session had a chance to come back.
 *
 * Apart from `AuthProvider` so that editing either can be hot-swapped, as
 * `instanceContext` and `permissionsContext` already are.
 */

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthContextType {
    status: AuthStatus;
    session: Session | undefined;
    signIn: (login: string, password: string) => Promise<Session>;
    signOut: () => Promise<void>;
    /** Records a session the account screen has just changed. */
    setSession: (session: Session) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth can only be used inside an AuthProvider");
    return context;
};
