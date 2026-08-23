// Submit to verdict, through every part at once.
//
// A manager builds an activity and a problem, publishes a version by reference,
// attaches it and enrols a participant; the participant sends a solution through
// the real screen; a Runner with no sandbox claims the job and reports; and the
// verdict reaches the screen **over the socket**, without a reload.
//
// Everything else in this repository proves one half. `check:ui` drives the
// screens against the fake, the Server's suite drives the API against no Client,
// and neither can see the two disagreeing. This is the one test that can.
//
//   docker compose -f example-full-stack-docker-compose.yaml up -d --build --wait
//   npx playwright test
import { expect, test } from "@playwright/test";
import { StubRunner } from "./stub-runner.mjs";

const APP = process.env.E2E_APP ?? "http://localhost:8082";
const API = process.env.E2E_API ?? "http://localhost:8080/api/v1";

// The field is called `email` and is handed to `PasswordSignInAsync`, which
// takes a user name — which is how an account with no address signs in at all.
const ADMIN = { email: "admin", password: "admin-development-only" };

/** A slug nobody else in this database is using. */
const unique = prefix => `${prefix}-${Date.now().toString(36)}`.toUpperCase();

/** SHA-256 of a string, the way the Client computes it before an upload. */
const sha256 = async (text) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
};

test("a submission reaches a verdict, and the screen shows it without a reload", async ({ page, playwright }) => {
    test.setTimeout(120_000);

    // ── the manager builds it ────────────────────────────────────────────────
    // Its own context, so the manager's cookie is not the participant's.
    //
    // No `baseURL`: Playwright joins with `new URL(path, base)`, where a leading
    // slash resets to the origin — so "/identity/login" against a base ending in
    // "/api/v1" asks for "/identity/login" and 404s. Absolute addresses have no
    // such trap, and the stub Runner builds them the same way.
    const admin = await playwright.request.newContext();
    const api = path => `${API}${path}`;
    const signedIn = await admin.post(api("/identity/login?useSessionCookies=true"), { data: ADMIN });
    expect(signedIn.status(), await signedIn.text()).toBe(200);

    const activitySlug = unique("E2E");
    const created = await admin.post(api("/activities"), {
        data: {
            slug: activitySlug,
            name: "Przepływ od zgłoszenia do werdyktu",
            type: "contest@1",
            rankingType: "icpc",
            timeZone: "Europe/Warsaw",
            // Open, so the participant can enrol themselves rather than needing
            // a grant written for them.
            joinPolicy: "open",
            languages: ["python"],
            attachmentVisibility: [{ name: "source", visibility: "participant" }],
        },
    });
    expect(created.status(), await created.text()).toBe(201);
    const activity = await created.json();

    // A round that is running: no start means started, which is what an untimed
    // activity is, and the scheduler and `Reconcile` now agree about that.
    const round = await admin.post(api(`/activities/${activity.id}/series`), {
        data: { slug: "runda", name: "Runda", revealProblemCount: true },
    });
    expect(round.status(), await round.text()).toBe(201);
    const series = await round.json();

    // ── the problem, published entirely by reference ─────────────────────────
    const statement = "# Suma\n\nWczytaj dwie liczby i wypisz ich sumę.\n";
    const upload = await admin.post(api("/files"), {
        multipart: {
            file: { name: "content.md", mimeType: "text/markdown", buffer: Buffer.from(statement) },
            sha256: await sha256(statement),
        },
    });
    expect(upload.status(), await upload.text()).toBe(201);
    const file = await upload.json();

    const problemSlug = unique("suma").toLowerCase();
    const problem = await (await admin.post(api("/problems"), {
        data: { slug: problemSlug, name: "Suma dwóch liczb", type: "standard-io@1" },
    })).json();

    // Pure JSON carrying an id: not one byte of the statement is in this request.
    const version = await admin.post(api(`/problems/${problem.id}/versions`), {
        data: { note: "pierwsza", statements: [{ fileId: file.id }] },
    });
    expect(version.status(), await version.text()).toBe(201);

    const attached = await admin.post(api(`/series/${series.id}/problems`), {
        data: { problemId: problem.id, slug: "A" },
    });
    expect(attached.status(), await attached.text()).toBe(201);

    // ── the Runner announces itself and is approved ──────────────────────────
    const runner = new StubRunner(API);
    await runner.register(`e2e-${activitySlug}`);
    const approved = await admin.post(api(`/runners/${runner.id}/approve`));
    expect(approved.status(), await approved.text()).toBe(200);
    // The manager's row, not the registration acknowledgement.
    expect((await approved.json()).state).toBe("approved");
    await runner.authenticate();

    // ── the participant, through the screen ──────────────────────────────────
    await page.goto(`${APP}/login`);
    await page.getByPlaceholder(/login/i).fill("team7");
    await page.getByPlaceholder(/has/i).fill("parity-development-only");
    await page.getByRole("button", { name: "Zaloguj" }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

    // Enrolling is the participant's own act, and the activity is open — so it
    // goes through their own session rather than a grant written for them by the
    // manager. Done as a call rather than by hunting for a button: what this
    // test is about starts at the submit form, and an activity nobody is in
    // refuses everything before that with `activity:read is required`.
    const enrolled = await page.evaluate(async (api) => {
        const r = await fetch(`${api}/enrolment`, {
            method: "POST", credentials: "include",
            headers: { "content-type": "application/json" }, body: "{}",
        });
        return r.status;
    }, `${API}/activities/${activitySlug}`);
    expect([200, 201, 204], `enrolling succeeds (${enrolled})`).toContain(enrolled);

    // A new round starts **shut** and is opened by the scheduler, on purpose:
    // `SeriesService` says so where it creates one, because a round whose start
    // is already past should be announced late rather than pretend it has just
    // happened. The scheduler scans every fifteen seconds, so this waits for it
    // — which is also what a manager creating a round actually experiences.
    //
    // Read through the participant's own session rather than a screen: if this
    // refuses, the failure is in the contract, and if it answers, whatever fails
    // next is the interface. The first version of this test could not tell those
    // two apart, and spent two runs looking like a broken statement page.
    await expect.poll(async () => await page.evaluate(async (url) => {
        const r = await fetch(url, { credentials: "include" });
        return r.status;
    }, `${API}/activities/${activitySlug}/problems/A`), {
        message: "the scheduler opens the round and the problem becomes readable",
        timeout: 45_000,
        intervals: [1_000],
    }).toBe(200);

    await page.goto(`${APP}/activities/${activitySlug}/problems/A`);
    await expect(page.getByText(/Suma|Wczytaj/)).toBeVisible({ timeout: 20_000 });

    // Opens the form. The page's own button is the one that does it; the modal
    // then carries its own, which is why these are two separate clicks and not
    // the same locator twice.
    await page.getByRole("button", { name: /^Wyślij$/ }).first().click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // The editor is Monaco. Both of its textareas are hidden from the
    // accessibility tree — one is a read-only `ime-text-area` — so there is
    // nothing to `fill`. Clicking the editing surface and typing is how a person
    // does it, and is the one approach that does not depend on Monaco's internal
    // markup.
    const editor = modal.locator(".monaco-editor").first();
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await editor.click();
    await page.keyboard.type("print(sum(map(int, input().split())))");

    // Created immediately before the click that causes it, or the wait starts
    // before there is anything to wait for.
    const submitted = page.waitForResponse(r =>
        r.url().includes("/submissions") && r.request().method() === "POST");
    await modal.getByRole("button", { name: /Wyślij|Zgłoś/i }).last().click();

    const response = await submitted;
    expect(response.status(), await response.text()).toBe(201);

    // **The only place the device header can be seen.** `check:ui` runs against
    // the fake, where `ApiFactory` builds no `HttpClient` at all, so nothing
    // there can say whether this travels — and the submission is the request
    // that most wants it, and the one whose `FormData` body used to mean no
    // headers of ours were set.
    const device = (await response.request().allHeaders())["device-id"];
    expect(device, "a submission says which browser sent it")
        .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const submission = await response.json();
    expect(submission.state, "a fresh submission is queued").toBe("queued");

    // ── the Runner judges it ─────────────────────────────────────────────────
    const job = await runner.claimFor(submission.id);
    expect(job, "the Runner claims the job this submission created").toBeTruthy();
    expect(job.problemType).toBe("standard-io@1");

    await runner.report(job, { score: 100, verdict: "Accepted" });

    // ── and the screen says so, without being reloaded ───────────────────────
    // Nothing is refetched by this test: `submissionStateChanged` arrives on the
    // socket, the generation counter moves, and the screen asks again by itself.
    await expect(page.getByText(/Accepted|Zaakceptowane|100/).first())
        .toBeVisible({ timeout: 30_000 });
});
