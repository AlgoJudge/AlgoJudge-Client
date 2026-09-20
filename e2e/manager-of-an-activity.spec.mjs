// A manager of one activity, against a real Server.
//
// **The report this exists for**: a participant was granted the `manager`
// role *inside an activity*, and the panel's screens then answered
// *"Access denied: problem:read:own is required"*. The panel offered them,
// because the guard asks what the person holds **anywhere**; the screens refused
// them, because the Server asked what they hold at **system scope**, where a
// grant written on an activity says nothing.
//
// Nothing else in either repository can see this. `check:ui` drives the fake,
// whose account fixtures held a system-scope set no role grants; the
// Server's own suite drives the API with no Client. This drives the screens
// against a Server that authorizes them.
//
//   docker compose -f example-full-stack-docker-compose.yaml up -d --build --wait
//   npx playwright test
import { expect, test } from "@playwright/test";

const APP = process.env.E2E_APP ?? "http://localhost:8082";
const API = process.env.E2E_API ?? "http://localhost:8080/api/v1";

const ADMIN = { email: "admin", password: "admin-development-only" };
// Seeded by `Seeder`, and a plain participant: it holds no manager grant
// anywhere until this test writes one.
const PERSON = { login: "student", password: "student-development-only" };

const unique = prefix => `${prefix}-${Date.now().toString(36)}`.toUpperCase();

test("a manager granted inside an activity can use the panel", async ({ page, playwright }) => {
    test.setTimeout(120_000);

    const admin = await playwright.request.newContext();
    const api = path => `${API}${path}`;
    const signedIn = await admin.post(api("/identity/login?useSessionCookies=true"), { data: ADMIN });
    expect(signedIn.status(), await signedIn.text()).toBe(200);

    // ── an activity, and the person who will manage it ───────────────────────

    const slug = unique("MGR");
    const created = await admin.post(api("/activities"), {
        data: {
            slug,
            name: "Kurs prowadzony przez managera",
            type: "course@1",
            rankingType: "points",
            timeZone: "Europe/Warsaw",
            joinPolicy: "open",
            languages: ["python"],
        },
    });
    expect(created.status(), await created.text()).toBe(201);
    const activity = await created.json();

    // `/users/managed` is the paged list; `/users` is the search, and it does not
    // match on a user name.
    const people = await admin.get(api("/users/managed?page=1&pageSize=100"));
    expect(people.status(), await people.text()).toBe(200);
    const person = (await people.json()).items.find(u => u.username === PERSON.login);
    expect(person, `no account named ${PERSON.login} in this database`).toBeTruthy();

    // **The role as it ships**, read rather than transcribed: a copy in this
    // file would pass while the product's own set said something else.
    const roles = await admin.get(api("/roles"));
    expect(roles.status(), await roles.text()).toBe(200);
    const manager = (await roles.json()).find(t => t.name === "manager");
    expect(manager, "no shipped role named manager").toBeTruthy();

    // Scoped to the activity, and **pointed at the role rather than holding a
    // copy of it** — the shape `ActivityService` writes for whoever creates one.
    const granted = await admin.post(api("/grants"), {
        data: {
            userId: person.id,
            activityId: activity.id,
            permissions: [],
            roleIds: [manager.id],
        },
    });
    expect(granted.status(), await granted.text()).toBe(200);

    // ── and now through the screens, as them ─────────────────────────────────

    await page.goto(`${APP}/login`);
    await page.getByPlaceholder(/login/i).fill(PERSON.login);
    await page.getByPlaceholder(/has/i).fill(PERSON.password);
    await page.getByRole("button", { name: "Zaloguj" }).click();
    await page.waitForURL(url => !url.pathname.startsWith("/login"), { timeout: 20_000 });

    const main = page.getByTestId("app-main");

    await page.goto(`${APP}/manager`);
    await expect(main).toContainText("Zarządzanie");
    // The panel is drawn from what this person holds anywhere, so the cards are
    // the promise the screens have to keep.
    await expect(main).toContainText("Zadania");
    await expect(main).toContainText("Aktywności");

    // **The screen the report was about.** The library is the installation's, not
    // an activity's, and managing one activity is what admits somebody to it.
    await page.goto(`${APP}/manager/problems`);
    await expect(main).toContainText("Zadania");
    await expect(main).not.toContainText("Access denied");

    // The activities list is narrowed rather than refused: this one, and not the
    // ones the seeded world holds that this person manages nothing in.
    await page.goto(`${APP}/manager/activities`);
    await expect(main).toContainText(slug);
    await expect(main).not.toContainText("Access denied");
    await expect(main).not.toContainText("AMMPZ");

    // Creating is a system-scope right the template does not carry, so the
    // control is not offered — a card that leads to a refusal is the thing this
    // panel's own table forbids.
    await expect(page.getByTestId("import-file")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Nowa aktywność" })).toHaveCount(0);

    for (const [path, heading] of [
        ["/manager/submissions", "Zgłoszenia"],
        ["/manager/questions", "Pytania"],
        ["/manager/grants", "Nadania"],
    ]) {
        await page.goto(`${APP}${path}`);
        await expect(main).toContainText(heading);
        await expect(main).not.toContainText("Access denied");
    }

    // The activity itself, which is what they were given.
    await page.goto(`${APP}/manager/activities/${slug}`);
    await expect(main).toContainText("Kurs prowadzony przez managera");
    await expect(main).not.toContainText("Access denied");
});
