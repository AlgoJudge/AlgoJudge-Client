import { useCallback, useEffect, useRef, useState } from "react";
import { ManagedUserSummary } from "../../api/ManagerApi";
import { optional, useApiCall } from "../../provider/apiContext";

/**
 * The panel's person picker, driven from the Server as the reader types.
 *
 * **Every picker in the panel was empty against a real installation**, and no
 * check could see it. Three screens primed their list once with
 * `searchUsers("")`, and the Server answers an empty needle with an empty list
 * before it touches the database — so the dropdown held nothing for anybody, an
 * administrator included, and the Mantine `Select` those lists feed filters its
 * `data` in the browser and never asks again. The fake, meanwhile, returns every
 * account it knows for an empty query, so `check:ui` drew a full picker of
 * people the product would never offer.
 *
 * The fix is the one thing a search field has to do: search. What is typed goes
 * to the Server, and what comes back is what may be chosen.
 *
 * `optional`, because the lookup asks `user:read:all` — a screen whose picker a
 * reader may not fill still draws, and still shows them everything else on it.
 */
export interface UserSearch {
    /** What the picker may offer right now. */
    users: ManagedUserSummary[];
    /** Wire to a `Select`'s `onSearchChange`. */
    search: (query: string) => void;
    /** Puts somebody into the list who is not a search result — an existing pick. */
    remember: (...people: ManagedUserSummary[]) => void;
}

/** Long enough that a name is not four requests, short enough not to be noticed. */
const SETTLE_MS = 250;

export function useUserSearch(): UserSearch {
    const call = useApiCall();
    const [users, setUsers] = useState<ManagedUserSummary[]>([]);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    // Rising, and compared on arrival: two searches in flight can answer out of
    // order, and the older one landing last would put the wrong list on screen.
    const latest = useRef(0);

    useEffect(() => () => clearTimeout(timer.current), []);

    const search = useCallback((query: string) => {
        clearTimeout(timer.current);
        const needle = query.trim();
        // The Server answers an empty needle with nothing, so asking would only
        // blank a list somebody is looking at.
        if (needle.length === 0) return;

        const mine = ++latest.current;
        timer.current = setTimeout(() => {
            void (async () => {
                const found = await optional(
                    call(api => api.managerApi.searchUsers(needle)), []);
                if (mine === latest.current) setUsers(found);
            })();
        }, SETTLE_MS);
    }, [call]);

    const remember = useCallback((...people: ManagedUserSummary[]) => {
        setUsers(current => {
            const known = new Set(current.map(u => u.id));
            const added = people.filter(u => u && !known.has(u.id));
            return added.length === 0 ? current : [...added, ...current];
        });
    }, []);

    return { users, search, remember };
}
