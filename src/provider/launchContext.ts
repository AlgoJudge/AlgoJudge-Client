import { createContext, useContext } from "react";
import { LaunchContext } from "../api/LtiApi";

/**
 * Whether this tab is inside an LTI launch, and what it launched.
 *
 * Split from the provider component for the same reason as `apiContext` and
 * `instanceContext`: a module exporting both a component and a plain function
 * cannot be hot-swapped, so editing it reloads the page and throws away whatever
 * somebody was typing.
 */

export type LaunchStatus = "loading" | "launched" | "none" | "failed";

export interface LaunchState {
    status: LaunchStatus;
    launch?: LaunchContext;
}

export const LaunchStateContext = createContext<LaunchState | undefined>(undefined);

export const useLaunch = (): LaunchState => {
    const context = useContext(LaunchStateContext);
    if (!context) throw Error("useLaunch can only be used inside a LaunchProvider");
    return context;
};

/**
 * Where a claimed launch is kept.
 *
 * <b>Per tab, and only for the tab.</b> `sessionStorage` is scoped to one tab
 * and cleared when it closes, which matches what this describes: somebody
 * opening the same activity in a second tab did not arrive there through a
 * launch and should get the full interface. `localStorage` would leak the
 * confined presentation across every tab and outlive the course.
 *
 * <b>This is presentation, never authorization.</b> Somebody who edits it can
 * make their own interface confined or unconfined; what they may read and do is
 * decided by their grants, on the Server, exactly as everywhere else. §5.2 says
 * the mode must not be entered because a URL said so — a ticket the Server
 * issued is what proves the launch happened, and this is only where the answer
 * is remembered afterwards.
 */
export const LAUNCH_STORAGE_KEY = "algojudge.launch";

export const readStoredLaunch = (): LaunchContext | undefined => {
    try {
        const stored = window.sessionStorage.getItem(LAUNCH_STORAGE_KEY);
        return stored ? (JSON.parse(stored) as LaunchContext) : undefined;
    } catch {
        // A browser with storage switched off, or a value somebody mangled.
        // Neither is a reason to fail a launch: the interface falls back to the
        // full one, which works.
        return undefined;
    }
};

export const storeLaunch = (launch: LaunchContext): void => {
    try {
        window.sessionStorage.setItem(LAUNCH_STORAGE_KEY, JSON.stringify(launch));
    } catch {
        // Storage refused — private browsing, a quota, an extension. The launch
        // still works for this page; it stops being confined on the next
        // navigation, which is visibly odd rather than broken.
    }
};

export const clearStoredLaunch = (): void => {
    try {
        window.sessionStorage.removeItem(LAUNCH_STORAGE_KEY);
    } catch {
        // Nothing to do about it, and nothing depends on it succeeding.
    }
};
