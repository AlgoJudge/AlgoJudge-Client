// A round is paused, and the people sitting in it are told — without a reload.
//
// **This is the reported defect in executable form, and it fails on a Server
// from before 2026-09-14.** Pausing announced `managerSeriesChanged`, whose
// audience is `activity:update`, and nothing else: the staff heard, the
// contestants did not. Their clocks carried on counting down a round that was
// standing still, the statements stayed on screen, and the first any of them
// knew was a refused submission.
//
// Nothing else in this repository could see it. `check:ui` drives the fake —
// which relayed `change: "paused"` to the participant all along, so every
// browser check was green and correctly so — and the Server's own suite has no
// Client to draw anything. Only a real socket between the two shows the gap.
//
//   docker compose -f example-full-stack-docker-compose.yaml up -d --build --wait
//   npx playwright test live-updates
import { expect, test } from "@playwright/test";

const APP = process.env.E2E_APP ?? "http://localhost:8082";
const API = process.env.E2E_API ?? "http://localhost:8080/api/v1";

const ADMIN = { email: "admin", password: "admin-development-only" };

const unique = prefix => `${prefix}-${Date.now().toString(36)}`.toUpperCase();

/** SHA-256 of a string, the way the Client computes it before an upload. */
const sha256 = async (text) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
};

test("pausing a round reaches the people in it, without a reload", async ({ page, playwright }) => {
    test.setTimeout(120_000);

    // Its own context, so the manager's cookie is not the participant's.
    const admin = await playwright.request.newContext();
    const api = path => `${API}${path}`;
    const signedIn = await admin.post(api("/identity/login?useSessionCookies=true"), { data: ADMIN });
    expect(signedIn.status(), await signedIn.text()).toBe(200);

    const activitySlug = unique("LIVE");
    const created = await admin.post(api("/activities"), {
        data: {
            slug: activitySlug,
            name: "Runda, która staje",
            type: "contest@1",
            rankingType: "icpc",
            timeZone: "Europe/Warsaw",
            joinPolicy: "open",
            languages: ["python"],
            attachmentVisibility: [{ name: "source", visibility: "participant" }],
        },
    });
    expect(created.status(), await created.text()).toBe(201);
    const activity = await created.json();

    const round = await admin.post(api(`/activities/${activity.id}/series`), {
        data: { slug: "runda", name: "Runda pierwsza", revealProblemCount: true },
    });
    expect(round.status(), await round.text()).toBe(201);
    const series = await round.json();

    // ── one problem, so the round is drawn at all ────────────────────────────
    // A round with no assignment is not listed on the problems page, so there
    // would be no row for the badge to appear on and the test would be asserting
    // against an empty screen.
    const statement = "# Suma\n\nWczytaj dwie liczby i wypisz ich sumę.\n";
    const upload = await admin.post(api("/files"), {
        multipart: {
            file: { name: "content.md", mimeType: "text/markdown", buffer: Buffer.from(statement) },
            sha256: await sha256(statement),
        },
    });
    expect(upload.status(), await upload.text()).toBe(201);
    const file = await upload.json();

    const problem = await (await admin.post(api("/problems"), {
        data: { slug: unique("suma").toLowerCase(), name: "Suma dwóch liczb", type: "standard-io@1" },
    })).json();
    const version = await admin.post(api(`/problems/${problem.id}/versions`), {
        data: { note: "pierwsza", statements: [{ fileId: file.id }] },
    });
    expect(version.status(), await version.text()).toBe(201);
    const attached = await admin.post(api(`/series/${series.id}/problems`), {
        data: { problemId: problem.id, slug: "A" },
    });
    expect(attached.status(), await attached.text()).toBe(201);

    // ── the participant, through the screen ──────────────────────────────────
    await page.goto(`${APP}/login`);
    await page.getByPlaceholder(/login/i).fill("team7");
    await page.getByPlaceholder(/has/i).fill("parity-development-only");
    await page.getByRole("button", { name: "Zaloguj" }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

    const enrolled = await page.evaluate(async (url) => {
        const r = await fetch(`${url}/enrollment`, {
            method: "POST", credentials: "include",
            headers: { "content-type": "application/json" }, body: "{}",
        });
        return r.status;
    }, `${API}/activities/${activitySlug}`);
    expect([200, 201, 204], `enrolling succeeds (${enrolled})`).toContain(enrolled);

    // A new round starts shut and the scheduler opens it, every fifteen seconds.
    // Polled through the participant's own session: if this refuses, the failure
    // is in the contract, and if it answers, whatever fails next is the screen.
    await expect.poll(async () => await page.evaluate(async (url) => {
        const r = await fetch(url, { credentials: "include" });
        if (r.status !== 200) return r.status;
        const rounds = await r.json();
        return rounds.some(s => s.isOpen) ? 200 : 0;
    }, `${API}/activities/${activitySlug}/series`), {
        message: "the scheduler opens the round",
        timeout: 45_000,
        intervals: [1_000],
    }).toBe(200);

    await page.goto(`${APP}/activities/${activitySlug}/problems`);
    // The statement is readable, which is the state the pause is going to change.
    await expect(page.getByText(/Suma dwóch liczb/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/wstrzymana/i)).toHaveCount(0);

    // ── the manager pauses it, and nobody touches the participant's tab ──────
    //
    // **With the statements taken away**, which is the pause a manager reaches
    // for mid-contest and the one with a signal a single-round activity draws:
    // `ProblemsPage` renders the round flat when there is only one, so the
    // "Paused" badge beside a round heading has no heading to sit beside.
    const paused = await admin.post(api(`/series/${series.id}/pause`), {
        data: { hideProblems: true },
    });
    expect(paused.status(), await paused.text()).toBe(200);

    // **No reload, no navigation, no refetch this test asked for.** The only
    // thing that can put this on screen is `seriesChanged` arriving on the
    // socket and `ProblemsPage` patching the round it names.
    await expect(page.getByText(/wstrzymana/i).first())
        .toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Suma dwóch liczb/i)).toHaveCount(0);

    // ── and resuming gives them back, over the wire ─────────────────────────
    //
    // This half is the one that catches a half-loaded round on the Server: the
    // payload withholds the statements unless the disclosure gate allows them,
    // and an announcer handed an entity without its `Activity` and
    // `SeriesProblems` answers "not open" and sends an empty round. Everything
    // would still be right in the database, and this screen would stay dark.
    const resumed = await admin.post(api(`/series/${series.id}/resume`), {
        data: { extendEnd: false },
    });
    expect(resumed.status(), await resumed.text()).toBe(200);

    await expect(page.getByText(/Suma dwóch liczb/i).first())
        .toBeVisible({ timeout: 30_000 });

    await admin.dispose();
});
