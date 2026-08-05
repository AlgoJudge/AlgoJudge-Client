import { createContext, useContext } from "react";

/**
 * What the signed-in person may do, for deciding what to show.
 *
 * The union across scopes, because a menu asks "is there anywhere you may do
 * this": a person who manages exactly one activity still needs the panel that
 * activity lives in. What may be **granted** is a different question, always
 * about one scope, and the screens that ask it call `getMyPermissions`
 * themselves.
 *
 * Hiding is not enforcement. These checks exist so nobody is shown a door they
 * cannot open; the Server refuses regardless, and the route guard refuses again
 * in front of the screen.
 */
export interface PermissionsContextType {
    /** Undefined until the answer arrives; a guard waits rather than refusing. */
    permissions: string[] | undefined;
    has: (permission: string) => boolean;
    hasAny: (permissions: readonly string[]) => boolean;
    loading: boolean;
}

export const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export const usePermissions = (): PermissionsContextType => {
    const context = useContext(PermissionsContext);
    if (!context) throw new Error("usePermissions can only be used inside a PermissionsProvider");
    return context;
};
