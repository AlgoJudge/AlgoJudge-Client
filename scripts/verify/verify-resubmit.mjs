// Sending a submission again from its own source.
//
// The page fetches the stored file, hands it to the editor, and makes a new
// submission out of what comes back. That last step is one API call, and the
// call has to carry a checksum: the Server reads the declared value before it
// reads the bytes and refuses anything that is not sixty-four hexadecimal
// characters.
//
// **This exists because the argument was missing and nothing noticed.** The
// button shipped in 0.1.0 sending no checksum, and failed against a real Server
// with "The file did not arrive with a usable checksum and was not stored". The
// fake accepted it, because it verified a checksum only when one was sent — so
// every check here passed. Both were fixed on 2026-09-08, and this is what
// keeps the button honest.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, click, close } = await open();
const { check, report } = results();

// A judged submission of the reader's own, whose source this activity shares
// with its author.
//
// **Its round has to be open**, which is why it is this one and not any of the
// six in `series-w1`: the fake refuses a closed series exactly as the Server
// does, and the refusal arrives before anything reads a checksum. `series-w2`
// runs from seven days ago to three days from now.
const OWN = "sub-series-w2-student-me-rekurencja-8640";

const main = () => evaluate(`
    const area = document.querySelector("[data-testid=app-main]");
    return (area?.innerText ?? "").replace(/\\s+/g, " ").trim();
`);

/** Controls by test id, as the browser checks address every control. */
const button = id => `document.querySelector("[data-testid=${id}]")`;

await go(`${APP}/activities/PROG-1-LA/submissions/${OWN}/code?fakeUser=amy`,
    `document.body.innerText.length > 200`);
await wait(2000);

const opened = await main();
check(/include|import|def |main/.test(opened), `the stored source opens (${opened.slice(0, 60)})`);

await click(button("edit"));
const editing = await main();
check(editing.includes("Wysłanie tworzy nowe zgłoszenie"),
    `editing says it creates a new submission rather than rewriting this one (${editing.slice(0, 120)})`);

await click(button("resubmit"));
await wait(2500);

const landed = await evaluate(`return location.pathname;`);
const after = await main();

// The refusal renders as the Server worded it, untranslated, in a red alert.
check(!/checksum/i.test(after), `nothing was refused (${after.slice(0, 90)})`);
check(/\/submissions\/[^/]+$/.test(landed) && !landed.includes(OWN),
    `and it lands on the submission it created (${landed})`);

await shot("resubmit");
report();
close();
