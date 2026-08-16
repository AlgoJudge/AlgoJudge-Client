// The browsers this repository has started, and closing them again.
//
//     npm run browsers -- list          what we started, and what is still alive
//     npm run browsers -- stop 31564    one of them, by pid
//     npm run browsers -- stop --all    all of them, and any leak they left
//
// **This replaces killing browsers by image name.** `taskkill /IM chrome.exe`
// and `pkill chrome` close the browser somebody is reading in, and there is no
// version of them that does not. Everything here is scoped by pid, and a pid is
// only accepted once the live process still carries our own profile directory —
// see `browser.mjs` for that check and for why it refuses rather than reports.
import { basename } from "node:path";
import { inventory, stopAll, stopOne, ROOT } from "./browser.mjs";

const [command = "list", argument] = process.argv.slice(2);

const clock = (iso) => {
    try {
        return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
        return "";
    }
};

/**
 * How many browsers are being left alone.
 *
 * Printed by every command, including the one that kills things. A sweep that
 * cannot say what it is not touching is a sweep nobody can check, and that is
 * how somebody's own windows end up closed.
 */
const untouched = (others) => {
    if (others.length === 0) {
        console.log("\n  No other browsers are running.");
        return;
    }
    console.log(`\n  ${others.length} other browser${others.length === 1 ? "" : "s"} on `
        + `${others.length === 1 ? "its" : "their"} own profile${others.length === 1 ? "" : "s"} — untouched:`);
    for (const other of others) console.log(`      ${String(other.pid).padStart(6)}  ${other.name}`);
};

if (command === "list") {
    const { ours, leaked, stale, others } = await inventory();
    if (ours.length + leaked.length + stale.length === 0) {
        console.log("  Nothing of ours is running.");
    }
    for (const entry of ours) {
        console.log(`  ours     ${String(entry.pid).padStart(6)}  ${entry.kind.padEnd(8)} port ${entry.port}`
            + `  ${basename(entry.profile).padEnd(24)} started by ${entry.startedBy} at ${clock(entry.startedAt)}`);
    }
    for (const orphan of leaked) {
        console.log(`  leaked   ${String(orphan.pid).padStart(6)}  ${orphan.name.padEnd(8)}`
            + "  no registry entry, matched by its profile");
    }
    for (const entry of stale) {
        console.log(`  stale    ${String(entry.pid).padStart(6)}  ${entry.kind.padEnd(8)}  ${entry.why}`);
    }
    untouched(others);
    if (leaked.length > 0 || stale.length > 0) console.log("\n  npm run browsers -- stop --all");
} else if (command === "stop" && argument === "--all") {
    const { closed, stale, untouched: left } = await stopAll();
    for (const result of closed) {
        console.log(`  ${result.outcome.padEnd(8)} ${String(result.pid).padStart(6)}`
            + `${result.why ? `  ${result.why}` : ""}`);
    }
    for (const entry of stale) console.log(`  dropped  ${String(entry.pid).padStart(6)}  ${entry.why}`);
    if (closed.length + stale.length === 0) console.log("  Nothing of ours was running.");
    console.log(`\n  ${left} other browser${left === 1 ? "" : "s"} left alone.`);
} else if (command === "stop" && /^\d+$/.test(argument ?? "")) {
    const result = await stopOne(Number(argument));
    console.log(`  ${result.outcome.padEnd(8)} ${String(result.pid).padStart(6)}`
        + `${result.why ? `  ${result.why}` : ""}`);
    // A refusal is an answer, not a failure to work around. It exits non-zero so
    // a script cannot mistake "I would not touch that" for "closed".
    if (result.outcome === "refused") {
        console.log(`\n  Only browsers started from ${ROOT} are closed here.`);
        process.exit(1);
    }
} else {
    console.error("  npm run browsers -- list\n"
        + "  npm run browsers -- stop <pid>\n"
        + "  npm run browsers -- stop --all");
    process.exit(2);
}
