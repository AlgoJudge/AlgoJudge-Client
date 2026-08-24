// A running round puts the rest out of reach, and the screens follow.
//
// **The seed's examination is its own activity**, `KOLOKWIUM-2`, restricted to
// `10.0.5.0/24` and ranked above the ordinary. Its own activity rather than a
// flag on `AMMPZ-2019` or `PROG-1-LA`, so the dozen scripts that read those keep
// reading what they always did.
//
// **It is scoped to its activity**, which is what the neighbour round below is
// for: `Ćwiczenia 4` runs beside it and is displaced by it, while `PROG-1-LA`
// carries on. Until 2026-08-24 every seeded activity ran exactly one round, so
// no screen ever drew a displaced one — and a locked round rendered as "not
// started yet" under a countdown to a start already past.
//
// `?fakeAddress=` is what lets one browser stand inside the room and outside it.
// A browser cannot know its own address, so the fake takes one the way it takes
// `?fakeUser=`. **Absent is not "anywhere"**: it stands for an address the Server
// could not read, which admits nobody and locks nobody.
//
// **Two rules this cannot show, and the Server tests do.** Neither is an
// oversight and both were tried here first.
//
// The **file rule**: a statement is authorised by *any* holder, and the fake
// serves files from one store without asking which round asked for them, so a
// check here would pass whatever the rule did.
//
// **"It follows the grant, not the room"**: every seeded reader is enrolled in
// the examination, so removing the narrowing changes nothing any of these
// assertions can see — proved by sabotaging it and watching them stay green.
// Building a second reader enrolled in one activity and not the other would be a
// fixture written for one line of one file.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, visit, click, close } = await open();
const { check, report } = results();

const INSIDE = "10.0.5.17";
const OUTSIDE = "203.0.113.9";

const body = () => evaluate(`return document.body.innerText;`);

/** The activity list, as this browser sees it from where it is standing. */
const activities = async (address) => {
    const query = address ? `&fakeAddress=${address}` : "";
    await go(`${APP}/activities?fakeUser=amy${query}`,
        `document.body.innerText.includes("Aktywno")`);
    await wait(2500);
    return body();
};

/** The rounds of one activity, from the same place. */
const rounds = async (slug, address) => {
    const query = address ? `&fakeAddress=${address}` : "";
    await go(`${APP}/activities/${slug}/problems?fakeUser=amy${query}`,
        `document.body.innerText.length > 0`);
    await wait(2500);
    return body();
};

// ── 1. Outside the room: the examination is not there ───────────────────────
//
// Absent rather than refused. Its dates and its problem count are exactly what
// it withholds, so a row saying "there is an examination you cannot reach" would
// disclose the thing being withheld.

// **The activity stays listed and the round does not.** What an address rule
// hides is the round: the person is enrolled and the activity is theirs, it is
// simply running nothing they can reach from here. Hiding the activity as well
// would be a different rule, and not the one that was asked for — §7 below is
// where the round's absence is asserted.
const away = await activities(OUTSIDE);
check(/Kolokwium 2/i.test(away),
    "the examination's activity is still theirs from outside the laboratory");

// ── 2. And it locks nothing from there ──────────────────────────────────────
//
// The reader is not in it — a rank they cannot reach cannot be their floor — so
// their coursework is untouched. This is the half that keeps a proxy failure
// from stopping every course at once.

check(/PROG-1-LA/.test(away) && !/Zablokowane przez/i.test(away),
    "and nothing else is locked from out there");
await shot("lockdown-outside");

// ── 3. Inside the room, an activity scope stops at the activity ─────────────
//
// The whole point of the scope: a course marking one round an examination must
// not lock its students out of every other course on the installation.

const inside = await activities(INSIDE);
check(/Kolokwium 2/i.test(inside),
    "inside the laboratory the examination is on the list");
check(!/Zablokowane przez/i.test(inside),
    "and an activity-scoped examination locks no other activity");
await shot("lockdown-inside");

// ── 4. Its own neighbour is displaced, and says by what ─────────────────────
//
// **The row that used to lie.** A displaced round is running, so the clock said
// "open" while the payload was empty, and the overlay fell through to "not
// started yet" with a countdown to a start an hour behind it.

const displaced = await rounds("KOLOKWIUM-2", INSIDE);
check(/Ćwiczenia 4/.test(displaced),
    "the neighbouring round is still on the page");
// Matched without case: a Mantine badge uppercases its text.
check(/Zablokowane przez[^\n]*Kolokwium 2/i.test(displaced),
    `the displaced round names what displaced it (${(/Zablokowane przez[^\n]*/i.exec(displaced) ?? ["—"])[0]})`);
check(!/Nie rozpocz/i.test(displaced),
    "and does not claim it has not started");
check(!/Pętle i złożoność/.test(displaced),
    "its problems went with it");
await shot("lockdown-displaced");

// ── 5. The examination itself is not displaced by its own rank ──────────────

check(/Stos i kolejka/i.test(displaced),
    "the round that set the floor still shows its own problems");

// ── 6. An address the Server cannot read admits nobody ──────────────────────

const nowhere = await rounds("KOLOKWIUM-2", undefined);
check(!/Stos i kolejka/i.test(nowhere),
    "an unknown address is admitted nowhere");
check(!/Zablokowane przez/i.test(await activities(undefined)),
    "and locks nothing, so a proxy that stops forwarding costs one round and not every course");

// ── 7. Outside the room the round is absent, not displaced ──────────────────

const hidden = await rounds("KOLOKWIUM-2", OUTSIDE);
check(!/Stos i kolejka/i.test(hidden),
    "outside the room the examination's problem is not listed");
check(!/Zablokowane przez/i.test(hidden),
    "and its neighbour is not displaced either: a round nobody can reach is nobody's floor");

// ── 8. The manager widens the scope, and the course locks ───────────────────
//
// The write path and the read path in one check, which is what `FakeLockdown`
// exists for: the panel writes the scope and the participant's screens read what
// it does. Nothing else here can tell an `activity` scope from an
// `installation` one.
//
// **From here on it is `visit`, never `go`.** The fake keeps a manager's writes
// in memory, so a full page load throws this one away and the two checks below
// would measure the seed again and pass for the wrong reason. `?fakeAddress=` is
// read off `location.search` on every call, and a pushState updates it.

const MANAGER_LIST = `[...document.querySelectorAll("tbody tr")]
    .some(r => r.innerText.includes("KOLOKWIUM-2"))`;
await go(`${APP}/manager/activities?fakeUser=john`, MANAGER_LIST);
await click(`[...document.querySelectorAll("tbody tr")]
    .find(r => r.innerText.includes("KOLOKWIUM-2"))?.querySelector("td")`);
await wait(2500);

/** The examination's own block: the course holds two rounds with the same controls. */
const examBlock = `[...document.querySelectorAll("[class*=Accordion-item]")]
    .find(i => i.innerText.startsWith("Kolokwium 2"))`;

/** The scope select inside that block, found by its label. */
const scopeInput = `[...((${examBlock})?.querySelectorAll("[class*=InputWrapper-root]") ?? [])]
    .find(w => w.textContent.includes("Zasięg ważności"))?.querySelector("input")`;

const widened = await evaluate(`
    const input = ${scopeInput};
    if (!input) return "no scope field";
    if (input.disabled) return "disabled";
    return input.value;
`);
check(widened === "Tylko w tej aktywności",
    `the examination is scoped to its activity in the panel (${widened})`);

await click(scopeInput);
await wait(700);
await click(`[...document.querySelectorAll("[class*=Combobox-option], [role=option]")]
    .find(o => o.textContent.trim() === "W całym systemie")`);
await wait(700);
await click(`[...((${examBlock})?.querySelectorAll("button") ?? [])]
    .find(b => b.textContent.trim() === "Zapisz")`);
await wait(2000);

// Read back before leaving: a check that only looked at the participant screen
// could not say whether the write or the read was the half that failed.
const stored = await evaluate(`return ${scopeInput}?.value ?? "gone";`);
check(stored === "W całym systemie", `the panel kept the wider scope (${stored})`);

await visit(`/activities?fakeAddress=${INSIDE}`,
    `document.body.innerText.includes("Aktywno")`);
await wait(2000);
const widenedList = await body();
check(/PROG-1-LA/.test(widenedList) && /Zablokowane przez/i.test(widenedList),
    "widened to the installation, the examination locks the other course too");
await shot("lockdown-widened");

// ── 9. And a locked activity carries the reason on its own page ─────────────
//
// The card refuses to navigate, but the address is typed and bookmarked. Before
// this the shell loaded and every tab under it failed with a generic error.

await visit(`/activities/PROG-1-LA?fakeAddress=${INSIDE}`,
    `document.body.innerText.length > 0`);
await wait(2000);
const lockedPage = await body();
check(/zablokowana/i.test(lockedPage) && /Kolokwium 2/.test(lockedPage),
    "the locked activity's own page says which round did it");
check(!/Przejdź do zada/i.test(lockedPage),
    "and does not offer the problems, which refuse");
await shot("lockdown-activity-page");

report();
close();
