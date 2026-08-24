// A running round puts the rest out of reach, and the screens follow.
//
// **The seed's examination is its own activity**, `KOLOKWIUM-2`, restricted to
// `10.0.5.0/24` and ranked above the ordinary. Its own activity rather than a
// flag on `AMMPZ-2019` or `PROG-1-LA`, so the dozen scripts that read those keep
// reading what they always did.
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
// assertions can see — proved by sabotaging it and watching all ten stay green.
// Building a second reader enrolled in one activity and not the other would be a
// fixture written for one line of one file.
import { open, results } from "./harness.mjs";

const APP = process.env.APP ?? "http://localhost:5180";
const { evaluate, wait, shot, go, close } = await open();
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
// would be a different rule, and not the one that was asked for — §6 below is
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

// ── 3. Inside the room: it is there, and the rest is locked ─────────────────

const inside = await activities(INSIDE);
check(/Kolokwium 2/i.test(inside),
    "inside the laboratory the examination is on the list");
check(/Zablokowane przez/i.test(inside),
    "and the rest is locked");
// Matched without case: a Mantine badge uppercases its text.
const reason = (/Zablokowane przez[^\n]*/i.exec(inside) ?? ["—"])[0];
check(/Kolokwium 2/i.test(reason), `and the lock names the round that did it (${reason})`);
await shot("lockdown-inside");

// ── 4. A locked activity does not open ──────────────────────────────────────
//
// The card refuses to navigate, because the Server refuses everything under it:
// landing somebody on a page of refusals instead of on the reason would be worse
// than the lock itself.

const clicked = await evaluate(`
    const card = [...document.querySelectorAll("[class*=Card]")]
        .find(c => c.innerText.includes("PROG-1-LA"));
    if (!card) return "no card";
    card.click();
    return window.location.pathname;
`);
check(clicked === "/activities",
    `a locked card does not open (${clicked})`);

// ── 5. An address the Server cannot read admits nobody ──────────────────────

const nowhere = await rounds("KOLOKWIUM-2", undefined);
check(!/Stos i kolejka/i.test(nowhere),
    "an unknown address is admitted nowhere");
check(!/Zablokowane przez/i.test(await activities(undefined)),
    "and locks nothing, so a proxy that stops forwarding costs one round and not every course");

// ── 6. The round's problems go with it ──────────────────────────────────────

const shown = await rounds("KOLOKWIUM-2", INSIDE);
check(/Stos i kolejka/i.test(shown),
    "inside the room the examination's problem is listed");

const hidden = await rounds("KOLOKWIUM-2", OUTSIDE);
check(!/Stos i kolejka/i.test(hidden),
    "and outside it is not");
await shot("lockdown-problems");

report();
close();
