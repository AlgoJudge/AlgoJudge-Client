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

/** What the source window says, which is where all of this now happens. */
const shown = () => evaluate(`
    const m = document.querySelector("[data-testid=modal]");
    return (m?.innerText ?? "").replace(/\\s+/g, " ").trim();
`);

/** Controls by test id, as the browser checks address every control. */
const button = id => `document.querySelector("[data-testid=${id}]")`;

// **Through the submission, because the source has no address of its own.**
// `/submissions/:id/code` was a screen until 2026-09-10 and is a modal now, so
// it is reached the way a reader reaches it: from the submission it belongs to.
await go(`${APP}/activities/PROG-1-LA/submissions/${OWN}?fakeUser=amy`,
    `document.body.innerText.length > 200`);
await wait(2000);
await click(button("show-code"));
await wait(2500);

const opened = await shown();
check(/include|import|def |main/.test(opened), `the stored source opens (${opened.slice(0, 60)})`);

await click(button("edit"));
await wait(600);
const editing = await shown();
check(editing.includes("Wysłanie tworzy nowe zgłoszenie"),
    `editing says it creates a new submission rather than rewriting this one (${editing.slice(0, 120)})`);

await click(button("resubmit"));
await wait(2500);

const landed = await evaluate(`return location.pathname;`);
const after = await evaluate(`return document.body.innerText.replace(/\\s+/g, " ").trim();`);

// The refusal renders as the Server worded it, untranslated, in a red alert.
check(!/checksum/i.test(after), `nothing was refused (${after.slice(0, 90)})`);
check(/\/submissions\/[^/]+$/.test(landed) && !landed.includes(OWN),
    // **A screen, because this one was reached as a screen.** The panel's
    // window keeps a resubmission in the window; here the reader came by
    // address and the address follows them — `verify-modal-stages.mjs` is the
    // other half of that rule.
    `and it lands on the submission it created (${landed})`);

await shot("resubmit");
report();
close();
