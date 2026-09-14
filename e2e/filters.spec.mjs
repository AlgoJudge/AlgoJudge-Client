// A filter chosen on the screen narrows the list the Server answers with.
//
// **The one thing in this repository that can prove it.** `check:ui` drives the
// screens against the fake, which honours every filter; the Server's own suite
// drives the API with no Client. Neither can see the two disagreeing about what
// goes on the wire — and on 2026-09-14 they had been disagreeing for months. The
// participant's submissions screen sent `problemId`, `seriesId` and `state` on
// every request, the action bound `page` and `pageSize`, and ASP.NET Core
// discarded the rest and answered 200 with the whole list. Every screen worked
// everywhere anybody tested it.
//
// So this drives the real transport against the real Server: two rounds, one
// submission in each, and a round picked from the control rather than typed into
// an address. If the Client builds a URL the Server does not bind, the second
// row stays and this fails.
//
//   docker compose -f example-full-stack-docker-compose.yaml up -d --build --wait
//   npx playwright test filters
import { expect, test } from "@playwright/test";

const APP = process.env.E2E_APP ?? "http://localhost:8082";
const API = process.env.E2E_API ?? "http://localhost:8080/api/v1";

const ADMIN = { email: "admin", password: "admin-development-only" };

const unique = prefix => `${prefix}-${Date.now().toString(36)}`.toUpperCase();

const sha256 = async (text) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
};

test("a round chosen on the screen narrows the participant's submissions", async ({ page, playwright }) => {
    test.setTimeout(180_000);

    const admin = await playwright.request.newContext();
    const api = path => `${API}${path}`;
    const signedIn = await admin.post(api("/identity/login?useSessionCookies=true"), { data: ADMIN });
    expect(signedIn.status(), await signedIn.text()).toBe(200);

    const activitySlug = unique("FILTER");
    const created = await admin.post(api("/activities"), {
        data: {
            slug: activitySlug,
            name: "Filtrowanie listy zgłoszeń",
            type: "contest@1",
            rankingType: "icpc",
            timeZone: "Europe/Warsaw",
            joinPolicy: "open",
            languages: ["python3"],
            attachmentVisibility: [{ name: "source", visibility: "participant" }],
        },
    });
    expect(created.status(), await created.text()).toBe(201);
    const activity = await created.json();

    // **Two rounds, which is the whole shape of the test.** One round cannot
    // tell a filter that narrows from a filter nothing binds: both answer with
    // everything there is.
    const statement = "# Zadanie\n\nWczytaj liczbę i wypisz ją.\n";
    const file = await (await admin.post(api("/files"), {
        multipart: {
            file: { name: "content.md", mimeType: "text/markdown", buffer: Buffer.from(statement) },
            sha256: await sha256(statement),
        },
    })).json();

    const rounds = [];
    for (const [index, name] of [["1", "Runda pierwsza"], ["2", "Runda druga"]]) {
        const round = await admin.post(api(`/activities/${activity.id}/series`), {
            data: { slug: `runda-${index}`, name, revealProblemCount: true },
        });
        expect(round.status(), await round.text()).toBe(201);
        const series = await round.json();

        const problem = await (await admin.post(api("/problems"), {
            data: {
                slug: `${unique("zad").toLowerCase()}-${index}`,
                name: `Zadanie ${index}`,
                type: "standard-io@1",
            },
        })).json();

        const version = await admin.post(api(`/problems/${problem.id}/versions`), {
            data: { note: "pierwsza", statements: [{ fileId: file.id }] },
        });
        expect(version.status(), await version.text()).toBe(201);

        const slug = index === "1" ? "A" : "B";
        const attached = await admin.post(api(`/series/${series.id}/problems`), {
            data: { problemId: problem.id, slug },
        });
        expect(attached.status(), await attached.text()).toBe(201);

        rounds.push({ name, slug, series });
    }

    // ── the participant ──────────────────────────────────────────────────────
    await page.goto(`${APP}/login`);
    await page.getByPlaceholder(/login/i).fill("team7");
    await page.getByPlaceholder(/has/i).fill("parity-development-only");
    await page.getByRole("button", { name: "Zaloguj" }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

    const enrolled = await page.evaluate(async (url) => {
        const r = await fetch(`${url}/enrolment`, {
            method: "POST", credentials: "include",
            headers: { "content-type": "application/json" }, body: "{}",
        });
        return r.status;
    }, `${API}/activities/${activitySlug}`);
    expect([200, 201, 204], `enrolling succeeds (${enrolled})`).toContain(enrolled);

    // A round starts shut and the scheduler opens it, which is what a manager
    // creating one actually experiences. Both have to be open before anything
    // can be sent to either.
    for (const round of rounds) {
        await expect.poll(async () => await page.evaluate(async (url) => {
            const r = await fetch(url, { credentials: "include" });
            return r.status;
        }, `${API}/activities/${activitySlug}/problems/${round.slug}`), {
            message: `the scheduler opens ${round.name}`,
            timeout: 60_000,
            intervals: [1_000],
        }).toBe(200);
    }

    // Sent through the participant's own session rather than the submit form:
    // what this test is about starts at the submissions list, and the form has
    // `verify-submit-modal` and `submit-to-verdict.spec.mjs` already.
    for (const round of rounds) {
        // **No newline in it, deliberately.** A text field in a `FormData` has
        // its line endings normalised to CRLF on the way into a multipart body,
        // so a checksum computed here does not describe the bytes the browser
        // sends, and the Server refuses it with `checksum_mismatch` — correctly.
        // The screens send a file rather than a string and never meet this; a
        // one-line program does not either.
        const source = `print(${round.slug === "A" ? 1 : 2})`;
        const sent = await page.evaluate(async ({ url, source, digest }) => {
            const body = new FormData();
            body.set("props", JSON.stringify({ type: "standard-io@1", language: "python3" }));
            body.set("code", source);
            body.set("fileName", "main.py");
            body.set("sha256", digest);
            const r = await fetch(url, { method: "POST", credentials: "include", body });
            return { status: r.status, text: await r.text() };
        }, {
            url: `${API}/activities/${activitySlug}/problems/${round.slug}/submissions`,
            source,
            digest: await sha256(source),
        });
        expect(sent.status, `sending to ${round.slug} succeeds: ${sent.text}`).toBe(201);
    }

    // ── and now the screen, which is the point ───────────────────────────────
    await page.goto(`${APP}/activities/${activitySlug}/submissions`);

    const rows = page.locator("[data-testid=app-main] tbody tr");
    await expect(rows).toHaveCount(2, { timeout: 30_000 });

    // Chosen from the control, not typed into an address: the URL the Client
    // builds is exactly what is under test.
    //
    // Clicked on the field rather than on the input inside it — the input is
    // covered by its own border element, and Playwright refuses to click through
    // something, which is the right refusal.
    // Forced, because the input is covered by its own border element and, once a
    // pill is in the field, by the pill as well. Nothing here is testing whether
    // a person can reach the control — `verify-filters` does that with a real
    // mouse; this is testing what the Client asks the Server for.
    const roundField = page.locator("input[data-testid=submission-series]");

    await roundField.click({ force: true });
    await page.getByRole("option", { name: rounds[0].name }).click();
    await page.keyboard.press("Escape");

    await expect(rows, "one round leaves one submission").toHaveCount(1, { timeout: 30_000 });
    await expect(rows.first()).toContainText(rounds[0].slug);

    // **And the other direction**, which is what says the Server answered the
    // question rather than the screen having lost a row.
    await roundField.click({ force: true });
    await page.getByRole("option", { name: rounds[1].name }).click();
    await page.keyboard.press("Escape");

    await expect(rows, "two rounds bring both back").toHaveCount(2, { timeout: 30_000 });
});
