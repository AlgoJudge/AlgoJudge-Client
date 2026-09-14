// A manager of one activity **configuring** it, against a real Server.
//
// `manager-of-an-activity.spec.mjs` beside this one asks whether the panel's
// screens open. This one asks the harder question: whether the person the
// product ships as *the manager of an activity* can actually do the job — set
// the activity up, run its rounds, answer its questions, work its printouts,
// and use the library the problems come out of.
//
// **Why it cannot be a `check:ui` script.** The fake answers `searchUsers("")`
// with every account it knows; the Server answers it with an empty list and
// asks `user:read:all` at system scope before even that. A screen that fills a
// picker from it therefore looks complete against the fake and is empty in an
// installation, and no amount of driving the fake can tell. The same is true of
// every scope question below: only a Server that authorises the request knows
// whether an activity-scoped grant reaches it.
//
//   docker compose -f example-full-stack-docker-compose.yaml up -d --build --wait
//   npx playwright test manager-configures-an-activity
import { expect, test } from "@playwright/test";

const APP = process.env.E2E_APP ?? "http://localhost:8082";
const API = process.env.E2E_API ?? "http://localhost:8080/api/v1";

const ADMIN = { email: "admin", password: "admin-development-only" };
// Seeded by `Seeder` as an ordinary participant. It holds nothing until this
// test grants it the shipped `manager` role, scoped to one activity.
const MANAGER = { login: "student", password: "student-development-only" };
// Seeded by `ParityWorld`. Somebody to ask a question and to want a printout.
const PARTICIPANT = { login: "team7", password: "parity-development-only" };

const REFUSED = "Nie masz uprawnień";

/** What the manager publishes as the activity rules. */
const RULES = `---
version: 1
---

# Zasady tego kursu

Oddanie do niedzieli.
`;

const unique = prefix => `${prefix}-${Date.now().toString(36)}`.toUpperCase();

const sha256 = async (text) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
};

const signIn = async (page, { login, password }) => {
    await page.goto(`${APP}/login`);
    await page.getByPlaceholder(/login/i).fill(login);
    await page.getByPlaceholder(/has/i).fill(password);
    await page.getByRole("button", { name: "Zaloguj" }).click();
    await page.waitForURL(url => !url.pathname.startsWith("/login"), { timeout: 20_000 });
};

/**
 * Picks an option in a Mantine `Select`.
 *
 * Not `selectOption`: Mantine draws a `<input readonly>` with a portalled
 * listbox and no `<select>` anywhere, so the only way in is the way a person
 * uses it.
 */
const choose = async (scope, label, option) => {
    await scope.getByLabel(label, { exact: false }).first().click();
    await scope.page().getByRole("option", { name: option }).first().click();
};

test("a manager of one activity can configure it, its questions, its printouts and its library",
    async ({ page, browser, playwright }) => {
        test.setTimeout(300_000);

        // ── the world, built by an administrator over the API ────────────────
        //
        // Everything the *manager* does happens through the screens below. This
        // part is scaffolding: what has to exist before there is anything to
        // manage, and it is deliberately not what is under test.

        const admin = await playwright.request.newContext();
        const api = path => `${API}${path}`;
        const signedIn = await admin.post(api("/identity/login?useSessionCookies=true"), { data: ADMIN });
        expect(signedIn.status(), await signedIn.text()).toBe(200);

        const mine = unique("CFG");
        const theirs = unique("OTHER");

        const created = {};
        for (const [slug, name] of [[mine, `Kurs ${mine}`], [theirs, `Nie mój kurs ${theirs}`]]) {
            const response = await admin.post(api("/activities"), {
                data: {
                    slug, name,
                    type: "course@1",
                    rankingType: "points",
                    timeZone: "Europe/Warsaw",
                    joinPolicy: "open",
                    languages: ["python"],
                },
            });
            expect(response.status(), await response.text()).toBe(201);
            created[slug] = await response.json();
        }
        const activity = created[mine];
        expect(activity?.id, "the activity just created carries an id").toBeTruthy();

        // A problem in the library, owned by the administrator and published to
        // the whole installation — so that "can a manager attach a problem
        // somebody else wrote" is a question this test actually asks.
        const statement = "# Suma\n\nWczytaj dwie liczby i wypisz ich sumę.\n";
        const file = await (await admin.post(api("/files"), {
            multipart: {
                file: { name: "content.md", mimeType: "text/markdown", buffer: Buffer.from(statement) },
                sha256: await sha256(statement),
            },
        })).json();

        const librarySlug = unique("suma").toLowerCase();
        const problem = await (await admin.post(api("/problems"), {
            data: { slug: librarySlug, name: "Suma dwóch liczb", type: "standard-io@1" },
        })).json();
        const version = await admin.post(api(`/problems/${problem.id}/versions`), {
            data: { note: "pierwsza", statements: [{ fileId: file.id }] },
        });
        expect(version.status(), await version.text()).toBe(201);
        const shared = await admin.post(api(`/problems/${problem.id}/visibility`), {
            data: { visibility: "instance", sharedWith: [] },
        });
        expect(shared.status(), await shared.text()).toBe(200);

        // The role **as it ships**, read rather than transcribed: a copy here
        // would keep passing while the product handed out something else.
        const roles = await (await admin.get(api("/roles"))).json();
        const managerRole = roles.find(r => r.name === "manager");
        expect(managerRole, "no shipped role named manager").toBeTruthy();

        const people = await (await admin.get(api("/users/managed?page=1&pageSize=200"))).json();
        const person = people.items.find(u => u.username === MANAGER.login);
        expect(person, `no account named ${MANAGER.login}`).toBeTruthy();

        // Scoped to the activity and pointed at the role — the exact shape
        // `ActivityService` writes for whoever creates an activity.
        const granted = await admin.post(api("/grants"), {
            data: { userId: person.id, activityId: activity.id, permissions: [], roleId: managerRole.id },
        });
        expect(granted.status(), await granted.text()).toBe(200);

        // ── from here on, as the manager, through the screens ────────────────

        await signIn(page, MANAGER);
        const main = page.getByTestId("app-main");
        const dialog = page.getByRole("dialog");
        // **Mantine keeps every tab mounted.** The inactive panels are in the
        // page with `display:none`, so a label as ordinary as "Nazwa" resolves
        // to the series editor while the settings tab is the one on screen.
        // Everything inside a tab is addressed through the visible panel.
        const panel = () => main.locator('[role="tabpanel"]:visible').first();

        await test.step("the panel offers what the role holds, and withholds the rest", async () => {
            await page.goto(`${APP}/manager`);
            // **The cards, not the shell.** `app-main` is visible as soon as the
            // route renders; the areas arrive with the permissions, one fetch
            // later, and reading the list before that answers an empty array
            // that looks exactly like a panel offering nothing.
            const cards = main.locator("a[href^='/manager/']");
            await expect(cards.first()).toBeVisible({ timeout: 20_000 });

            const offered = await cards
                .evaluateAll(links => links.map(a => a.getAttribute("href")).sort());

            for (const area of ["/manager/activities", "/manager/problems", "/manager/submissions",
                "/manager/questions", "/manager/printouts", "/manager/grants", "/manager/roles"]) {
                expect(offered, `the panel offers ${area}`).toContain(area);
            }
            // Installation-wide administration, deliberately not a manager's.
            for (const withheld of ["/manager/users", "/manager/runners", "/manager/instance",
                "/manager/oidc", "/manager/lti", "/manager/external-content"]) {
                expect(offered, `the panel withholds ${withheld}`).not.toContain(withheld);
            }

            // Typed in by hand it refuses rather than drawing an empty screen.
            await page.goto(`${APP}/manager/users`);
            await expect(main).toContainText(REFUSED);
        });

        await test.step("the lists are narrowed to the activity this person manages", async () => {
            await page.goto(`${APP}/manager/activities`);
            await expect(main, "the activities list is not refused").not.toContainText(REFUSED);
            await expect(main, `it carries ${mine}`).toContainText(mine, { timeout: 20_000 });
            await expect(main, `it leaves out ${theirs}`).not.toContainText(theirs);

            // **The activity picker, not the rows.** These three screens are
            // empty until somebody submits, asks or prints, so an empty list is
            // not evidence of anything. What the filter offers is: it is built
            // from every activity this person may see, which is the narrowing
            // the report of 2026-09-09 was about.
            for (const area of ["/manager/submissions", "/manager/questions", "/manager/printouts"]) {
                await page.goto(`${APP}${area}`);
                await expect(main, `${area} is not refused`).not.toContainText(REFUSED);

                const picker = main.getByPlaceholder("Wszystkie aktywności").first();
                await expect(picker, `${area} draws an activity filter`).toBeVisible({ timeout: 20_000 });
                await picker.click();
                const options = await page.getByRole("option")
                    .evaluateAll(items => items.map(o => o.textContent ?? ""));
                await page.keyboard.press("Escape");

                expect(options.join(" | "), `${area} offers ${mine}`).toContain(mine);
                expect(options.join(" | "), `${area} leaves out ${theirs}`).not.toContain(theirs);
            }
        });

        await test.step("a round is created, a problem attached to it, and it is paused and resumed", async () => {
            await page.goto(`${APP}/manager/activities/${mine}?tab=series`);
            await expect(main).toContainText("Nowa seria");

            await main.getByRole("button", { name: "Nowa seria" }).click();
            await expect(dialog).toBeVisible();
            await dialog.getByLabel("Nazwa").fill("Runda pierwsza");
            await dialog.getByLabel("Slug").fill("runda-1");
            await dialog.getByTestId("save").click();
            await expect(dialog).toBeHidden({ timeout: 15_000 });
            await expect(main).toContainText("Runda pierwsza");

            // **Opened by hand.** The accordion takes its open items from
            // `defaultValue`, which is read once — at a first load with no
            // series at all — so a round created afterwards arrives collapsed
            // and everything inside it, attaching included, is out of reach
            // until somebody clicks it.
            await main.getByRole("button", { name: /Runda pierwsza/ }).first().click();

            // **Somebody else's problem, published to the installation.** The
            // library is the installation's; managing one activity is what
            // admits a person to it, and attaching is what they came for.
            const attach = main.getByRole("button", { name: "Podepnij zadanie" }).first();
            await expect(attach).toBeVisible({ timeout: 20_000 });
            await attach.click();
            await expect(dialog).toBeVisible();
            await choose(dialog, "Zadanie", new RegExp(librarySlug, "i"));
            await dialog.getByLabel("Slug w tej aktywności").fill("A");
            await dialog.getByTestId("save").click();
            await expect(dialog).toBeHidden({ timeout: 15_000 });
            await expect(main, "the assignment lands in the round").toContainText("Suma dwóch liczb");

            // Pausing and resuming are two of the five kinds `seriesChanged`
            // declares, and the two a manager uses while a class is running.
            await main.getByTestId("series-pause-toggle").first().click();
            await expect(dialog).toBeVisible();
            await dialog.getByTestId("pause").click();
            await expect(main).toContainText("Wstrzymana", { timeout: 15_000 });

            await main.getByTestId("series-pause-toggle").first().click();
            await expect(dialog).toBeVisible();
            await dialog.getByTestId("resume").click();
            await expect(main).not.toContainText("Wstrzymana", { timeout: 15_000 });
        });

        await test.step("the activity's own settings are edited and stay edited", async () => {
            await page.goto(`${APP}/manager/activities/${mine}?tab=settings`);
            const renamed = `Kurs ${mine} po zmianie`;
            const settings = panel();
            await settings.getByLabel("Nazwa", { exact: false }).first().fill(renamed);

            // **Printing ships off**, on the reasoning that an activity with
            // nobody at a printer should not offer a button into a queue no one
            // works. Turning it on is part of setting an activity up, and the
            // printout half of this test depends on it.
            await settings.getByLabel("Wydruki").check();
            await settings.getByTestId("save").click();

            await page.reload();
            await expect(main, "the change survives a reload").toContainText(renamed);
            await expect(panel().getByLabel("Wydruki"), "and so does the module switch")
                .toBeChecked({ timeout: 15_000 });
        });

        await test.step("the activity's rules are published and a participant reads them", async () => {
            await page.goto(`${APP}/manager/activities/${mine}?tab=documents`);
            await expect(main).toContainText("Regulamin");

            const rules = panel().locator("tbody tr").filter({ hasText: "Regulamin" });
            await rules.getByRole("button").first().click();
            const editor = panel().locator("textarea").first();
            await expect(editor).toBeVisible({ timeout: 15_000 });
            await editor.fill(RULES);
            await panel().getByTestId("publish").click();

            await expect(panel(), "the revision it replaced is kept")
                .toContainText("Wcześniejsze wersje", { timeout: 25_000 });
        });

        await test.step("a group is created and temporary accounts are made for the class", async () => {
            await page.goto(`${APP}/manager/activities/${mine}?tab=participants`);
            await expect(main).toContainText("Grupy");

            await panel().getByPlaceholder("Nazwa grupy").fill("Zespół A");
            await panel().getByTestId("add-group").click();
            await expect(main, "the group is listed").toContainText("Zespół A", { timeout: 15_000 });

            // `user:create:temporary` is in the role, and this is the only
            // screen a manager can reach that spends it.
            await panel().getByTestId("temporary-accounts").click();
            await expect(dialog).toBeVisible();
            await dialog.getByLabel("Przedrostek").fill(`kl-${Date.now().toString(36)}`);
            await dialog.getByLabel("Ile").fill("2");
            await dialog.getByTestId("create").click();

            // The passwords come back once, in a block this test reads and does
            // not print. Two lines of accounts plus the header.
            // Mantine draws `Code block` as a `pre`, not a `code`.
            const credentials = page.getByRole("dialog").locator("pre").first();
            await expect(credentials).toBeVisible({ timeout: 20_000 });
            const rows = (await credentials.innerText()).trim().split(/\r?\n/);
            expect(rows.length, "two accounts and a header come back").toBe(3);
            await page.getByTestId("done").click();
        });

        await test.step("somebody already in the installation can be enrolled by hand", async () => {
            await page.goto(`${APP}/manager/activities/${mine}?tab=participants`);
            await panel().getByTestId("enrol-someone").click();
            await expect(dialog).toBeVisible();

            // **The role carries `activity:enroll` and `grant:update`.** If the
            // picker cannot name anybody, it carries two permissions no screen
            // can spend — which is the defect this step exists for. Mantine
            // renders the options into a portal only once the field is opened.
            const picker = dialog.getByLabel("Użytkownik", { exact: false }).first();
            await picker.click();
            // **Typed, because the picker searches the Server.** Priming it with
            // an empty query finds nobody — the Server short-circuits before it
            // touches the database — so a field that never asks again is a field
            // that is always empty.
            await picker.fill(PARTICIPANT.login);

            // **Named, and the names reported.** Mantine portals the dropdown
            // out of the modal and draws furniture in it either way, so the
            // question is whether a real account can be picked — and the message
            // carries what was on offer, because "empty" and "the wrong things"
            // are two different defects.
            await page.waitForTimeout(1_500);
            const options = await page.getByRole("option").allInnerTexts();
            const canName = options.some(text => new RegExp(PARTICIPANT.login, "i").test(text));
            expect(canName,
                `the user picker can name somebody to enrol (offered: ${options.join(" | ") || "nothing"})`)
                .toBe(true);

            {
                const chosen = page.getByRole("option", { name: new RegExp(PARTICIPANT.login, "i") }).first();
                // The option reads `Name (login)`; the roster's first column is
                // the display name alone, so that is what it is looked for by.
                const shown = (await chosen.innerText()).split(" (")[0].trim();
                await chosen.click();
                await dialog.getByTestId("save").click();
                await expect(dialog).toBeHidden({ timeout: 15_000 });
                await expect(main, `the roster carries them (${shown})`)
                    .toContainText(shown, { timeout: 15_000 });
            }
        });

        await test.step("the library opens, and a problem in it opens with its versions", async () => {
            await page.goto(`${APP}/manager/problems`);
            await expect(main).not.toContainText(REFUSED);
            await expect(main, "the shared problem is in the library").toContainText(librarySlug);

            // A problem of the manager's own, made through the screen.
            await main.getByRole("button", { name: "Nowe zadanie" }).click();
            await expect(dialog).toBeVisible();
            const ownSlug = unique("wlasne").toLowerCase();
            await dialog.getByLabel("Nazwa", { exact: false }).first().fill("Zadanie prowadzącego");
            await dialog.getByLabel("Slug", { exact: false }).first().fill(ownSlug);
            await dialog.getByTestId("save").click();

            // Creating opens the editor on what was created. **Its versions have
            // to be there**: the page loads the problem, then the people it can
            // be shared with, then the versions — so one refusal in the middle
            // leaves a problem on screen with no history and no statement, which
            // reads as an empty problem rather than as a refusal.
            await expect(page).toHaveURL(/\/manager\/problems\/[^/]+$/, { timeout: 20_000 });
            await expect(main).toContainText("Zadanie prowadzącego");

            await page.goto(`${APP}/manager/problems`);
            await main.locator("tbody tr").filter({ hasText: librarySlug })
                .getByRole("button", { name: "Otwórz" }).first().click();
            await expect(main).toContainText("Suma dwóch liczb", { timeout: 20_000 });
            await main.getByRole("tab", { name: "Wersje" }).click();
            await expect(main, "the versions of a problem a manager may read are listed")
                .toContainText("v1", { timeout: 15_000 });
        });

        await test.step("the activity's own roles can be written from the panel", async () => {
            await page.goto(`${APP}/manager/roles`);
            await expect(main).not.toContainText(REFUSED);

            // **Scoped to the one activity this person runs.** `role:manage` is
            // held there and nowhere else, so the page opens on it — asked at
            // system scope every control on it refuses and the activity's own
            // roles are not even listed.
            // Chosen by hand, as a person does: this manager may run several
            // activities, and the roles being written belong to one of them.
            await choose(main, "Czyje role", new RegExp(mine, "i"));

            const named = `rola-${mine.toLowerCase()}`;
            await main.getByRole("button", { name: "Nowa rola" }).click();
            await expect(dialog).toBeVisible();
            await dialog.getByLabel("Nazwa", { exact: false }).first().fill(named);
            await dialog.getByTestId("save").click();
            await expect(dialog).toBeHidden({ timeout: 15_000 });

            await expect(main, "the role is written and listed")
                .toContainText(named, { timeout: 20_000 });
        });

        // ── the participant's half, in a session of its own ──────────────────

        const theirContext = await browser.newContext({
            locale: "pl-PL", timezoneId: "Europe/Warsaw",
        });
        const them = await theirContext.newPage();
        const theirMain = them.getByTestId("app-main");

        await test.step("a participant asks a question and the manager answers and publishes it",
            async () => {
                await signIn(them, PARTICIPANT);

                // Scaffolding, and only reached when the step above could not
                // enrol them: the activity is open, so they let themselves in.
                // Idempotent — already being in answers with the activity.
                await them.evaluate(async (url) => {
                    await fetch(url, {
                        method: "POST", credentials: "include",
                        headers: { "content-type": "application/json" }, body: "{}",
                    });
                }, `${API}/activities/${mine}/enrolment`);

                await them.goto(`${APP}/activities/${mine}/rules`);
                await expect(theirMain, "the participant reads the rules the manager published")
                    .toContainText("Zasady tego kursu", { timeout: 20_000 });

                await them.goto(`${APP}/activities/${mine}/questions`);
                await them.getByRole("button", { name: "Zadaj pytanie" }).click();
                const theirDialog = them.getByRole("dialog");
                await expect(theirDialog).toBeVisible();
                await theirDialog.getByLabel("Temat").fill("Czy wolno użyć biblioteki standardowej?");
                await theirDialog.getByLabel("Pytanie", { exact: false }).fill("Pytam o STL.");
                await theirDialog.getByRole("button", { name: /^Wyślij$/ }).click();
                await expect(theirDialog).toBeHidden({ timeout: 15_000 });

                await page.goto(`${APP}/manager/questions?activity=${activity.id}`);
                await expect(main).toContainText("biblioteki standardowej", { timeout: 20_000 });

                // The manager's list is a column of cards, not a table.
                await main.locator("[class*='mantine-Card-root']")
                    .filter({ hasText: "biblioteki standardowej" }).first()
                    .getByRole("button", { name: "Odpowiedź" }).click();
                await expect(dialog).toBeVisible();
                await dialog.locator("textarea").first().fill("Tak, wolno.");
                // Answering and publishing are two acts; this does both, which
                // is what `question:answer` plus `question:publish` buys.
                await dialog.getByLabel("Opublikuj wszystkim uczestnikom").check();
                await dialog.getByTestId("save").click();
                await expect(dialog).toBeHidden({ timeout: 15_000 });

                // The list carries topics; the answer lives in the window the
                // row opens, which is where a participant actually reads it.
                await them.reload();
                await them.locator("tbody tr").filter({ hasText: "biblioteki standardowej" })
                    .first().click();
                await expect(them.getByRole("dialog"), "the participant reads the published answer")
                    .toContainText("Tak, wolno.", { timeout: 20_000 });
                await them.keyboard.press("Escape");
            });

        await test.step("the manager announces something to the whole activity", async () => {
            await page.goto(`${APP}/manager/questions?activity=${activity.id}`);
            await main.getByRole("button", { name: "Nowe ogłoszenie" }).click();
            await expect(dialog).toBeVisible();
            await dialog.getByLabel("Temat").fill("Zajęcia odwołane");
            await dialog.getByLabel("Treść").fill("W czwartek nie ma zajęć.");
            // No test id on this one, unlike the answer modal beside it.
            await dialog.getByRole("button", { name: "Zapisz" }).click();
            await expect(dialog).toBeHidden({ timeout: 15_000 });

            await them.goto(`${APP}/activities/${mine}/questions`);
            await expect(theirMain, "every participant gets the announcement")
                .toContainText("Zajęcia odwołane", { timeout: 20_000 });
        });

        await test.step("a participant asks for a printout and the manager works the queue", async () => {
            await them.goto(`${APP}/activities/${mine}/printouts`);
            await them.getByTestId("printout-language").click();
            await them.getByRole("option").first().click();
            await them.locator(".monaco-editor").first().click();
            await them.keyboard.type("print('hello')");
            // Sending asks twice: the page's button, then the window that says
            // what will be printed and under what name.
            await them.getByTestId("printout-send").click();
            const confirm = them.getByTestId("printout-confirm");
            await expect(confirm).toBeVisible({ timeout: 15_000 });
            await confirm.click();
            await expect(them.getByTestId("printouts-mine"), "it joins their own list")
                .toContainText("Oczekuje", { timeout: 20_000 });

            await page.goto(`${APP}/manager/printouts`);
            await expect(main, "the job reaches the queue of the activity they manage")
                .toContainText(mine, { timeout: 20_000 });

            // Printing opens the sheet in a tab of its own and claims the job;
            // the queue then asks what actually came out of the printer.
            await main.getByTestId("printout-print").first().click();
            await expect(dialog).toBeVisible({ timeout: 15_000 });
            await dialog.getByTestId("printout-printed").click();
            // `printout-state` is the filter at the top of the screen, not a
            // cell: the row's own state is read off the queue.
            await expect(main.getByTestId("printout-queue"),
                "the manager works the job to its end").toContainText("Wydrukowany", { timeout: 25_000 });
        });

        await theirContext.close();
    });
