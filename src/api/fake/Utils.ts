/**
 * `throwError` lived here until 2026-08-08 and threw a bare `Error`. Every
 * refusal the fake makes now goes through `./refuse`, which throws the typed
 * classes carrying the Server's own codes — see the note at the top of that
 * file for why the difference matters.
 */
export class Utils {
    static async sleep(ms: number): Promise<void> {
        if (ms == 0) {
            return;
        }
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
