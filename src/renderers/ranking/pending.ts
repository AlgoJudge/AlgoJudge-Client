import { TFunction } from "i18next";
import { Pending } from "./scoreboard";

/**
 * What a `?` cell means, in words.
 *
 * Its own module rather than a function in `common.tsx`: a file that exports
 * both components and a plain function loses fast refresh, and lint says so.
 *
 * One wording for both boards, so the ICPC table and the points table cannot
 * come to describe the same cell differently. A freeze is a decision to
 * withhold, judging is a wait, and an evaluation that failed or was canceled is
 * neither — one label over all three said *submitted during the freeze* above
 * cells no freeze had touched.
 *
 * **Written out in full**, one branch each, rather than built from the reason.
 * `check:i18n` reads calls written literally and nothing else, so an assembled
 * key is a translation nothing checks — and a missing one renders as English on
 * a Polish screen with every other check staying silent.
 *
 * Nor may the sentence above spell a call out: that check walks `src`, so a
 * quoted example in a comment reads to it as a key no catalog holds.
 */
export const pendingLabel = (t: TFunction, pending: Pending): string => {
    if (pending === "frozen") return t("Submitted during the freeze");
    if (pending === "judging") return t("Not judged yet");
    return t("No verdict was returned");
};
