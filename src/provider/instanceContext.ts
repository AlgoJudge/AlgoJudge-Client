import { createContext, useContext } from "react";
import { InstanceInfo } from "../api/CoreApi";

/**
 * The context and its hook, apart from the component that fills it.
 *
 * Two files rather than one because a module exporting both a component and a
 * plain function loses fast refresh — the rule the older providers predate and
 * that the lint baseline records nine times over. New code does not add a tenth.
 */

export interface InstanceContextType {
    instance: InstanceInfo;
    /**
     * The mark to draw: the operator's, or the placeholder that ships with the
     * software. Absent only when the operator turned the mark off.
     */
    logoUrl: string | undefined;
}

export const InstanceContext = createContext<InstanceContextType | undefined>(undefined);

export const useInstance = (): InstanceContextType => {
    const context = useContext(InstanceContext);
    if (!context) throw new Error("useInstance can only be used inside an InstanceProvider");
    return context;
};
