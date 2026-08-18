// The one behavioural path the ApiError rewrite could break: a refused sign-in
// must still be recognised as refused, not reported as an unknown failure.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { send, evaluate, wait, go, type } = await open();
const { check, report } = results();

await send("Page.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });

await go(`${APP}/`, `document.body !== null`);
await evaluate(`localStorage.clear(); sessionStorage.clear(); return true;`);
await go(`${APP}/login`, `document.querySelector("input[type=password]") !== null`);

await type("input:not([type=password])", "jkowalski");
await type("input[type=password]", "definitely-not-the-password");
await evaluate(`
    [...document.querySelectorAll("button")].find(b => b.type === "submit"
        || /Zaloguj|Sign in|Login/i.test(b.textContent))?.click();
    return true;
`);
await wait(2500);
const refused = await evaluate(`return document.body.innerText.replace(/\\s+/g, " ");`);
check(/nieprawid|niepoprawn|invalid|incorrect|błędn/i.test(refused),
    "a wrong password is reported as a wrong password");
check(!/status \\d\\d\\d|InvalidStatus/i.test(refused), "and not as a bare status");
check(await evaluate(`return location.pathname;`) === "/login", "and the reader stays on the screen");

// The right one still works, so the rewrite did not break the ordinary path.
await type("input[type=password]", "Test1!");
await evaluate(`
    [...document.querySelectorAll("button")].find(b => b.type === "submit"
        || /Zaloguj|Sign in|Login/i.test(b.textContent))?.click();
    return true;
`);
await wait(3500);
check(await evaluate(`return location.pathname;`) !== "/login", "the right password signs in");

report();
