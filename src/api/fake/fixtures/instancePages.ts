import type { FixtureDocument } from "./documents";

/**
 * The two front pages that ship with an instance.
 *
 * The same arrangement as the legal documents: `content.md` the operator owns,
 * drawn by the renderer that draws a problem statement, shipped as a template
 * that says so. One page for a visitor who has not signed in and one for a
 * person who has, because the two have entirely different questions — "what is
 * this and may I have an account" against "where do I go now".
 *
 * Each ships in Polish with an English translation beside it, the way a problem
 * statement carries `content-en.md`: the reader is shown the one matching their
 * interface language. The four legal templates stay Polish, because an English
 * "template" of a Polish-law policy would pretend to be written for a
 * jurisdiction nobody has written for.
 *
 * The logo is referenced as `logo.svg`, an attachment the page supplies: the
 * operator's mark where they have set one, the shipped placeholder where they
 * have not.
 */

const WELCOME = `---
version: 1
---

# AlgoJudge — instancja [OPERATOR]

> **Szablon.** Zastąp tę stronę tekstem swojej instalacji. Do tego czasu
> odwiedzający czyta opis produktu, a nie Twojej uczelni ani Twoich zawodów.

![Robot sprawdzający rozwiązanie](<logo.svg>)

Ta instancja służy do prowadzenia **zawodów programistycznych i zajęć** —
rozwiązania wysyła się tutaj, a system ocenia je automatycznie na zestawie
testów przygotowanym przez prowadzącego.

## Skąd wziąć konto

Rejestracja jest zamknięta: konta zakłada organizator albo pochodzą one od
uczelnianego dostawcy tożsamości. Nikt nie zapisuje się tu z ulicy.

| Kim jesteś | Co zrobić |
|---|---|
| Uczestnik zawodów | Odbierz login od organizatora — zwykle razem z kartką na sali |
| Student | Zaloguj się kontem uczelnianym, jeśli ta instalacja je obsługuje |
| Prowadzący | Napisz do administratora instancji: [ADRES KONTAKTOWY](mailto:kontakt@example.edu.pl) |

## Co znajdziesz po zalogowaniu

- listę swoich aktywności — zawodów, kursów, zestawów treningowych,
- treści zadań wraz z limitami i przykładami do pobrania,
- formularz wysyłania rozwiązań i historię swoich zgłoszeń,
- ranking oraz pytania do prowadzącego, jeśli aktywność je udostępnia.

## Zanim zaczniesz

[Zaloguj się](/login), a potem zajrzyj do [swoich aktywności](/activities).
Regulamin i polityka prywatności tej instalacji są w stopce; zasady konkretnych
zawodów publikuje organizator w samej aktywności.
`;

const WELCOME_EN = `---
version: 1
---

# AlgoJudge — the [OPERATOR] instance

> **Template.** Replace this page with your installation's own text. Until you
> do, a visitor reads a description of the product rather than of your
> university or your contest.

![A robot checking a solution](<logo.svg>)

This instance runs **programming contests and courses**: solutions are submitted
here and judged automatically against the tests their author prepared.

## How to get an account

There is no sign-up form. Accounts are created by an organiser or come from the
university's identity provider.

| Who you are | What to do |
|---|---|
| A contestant | Collect your login from the organiser — usually on paper, in the room |
| A student | Sign in with your university account, if this installation accepts one |
| Teaching staff | Write to the instance administrator: [CONTACT ADDRESS](mailto:kontakt@example.edu.pl) |

## What is behind the sign-in

- your activities — contests, courses, practice sets,
- problem statements with their limits and sample tests to download,
- the submission form and the history of everything you have sent,
- the ranking and questions to the staff, where the activity offers them.

## Before you start

[Sign in](/login), then look at [your activities](/activities). This
installation's terms and privacy policy are in the footer; the rules of a
particular contest are published by its organiser inside the activity itself.
`;

const HOME = `---
version: 1
---

# Witaj w AlgoJudge

> **Szablon.** Zastąp tę stronę powitaniem swojej instalacji: co się na niej
> dzieje, do kogo pisać i czego się trzymać.

![Robot sprawdzający rozwiązanie](<logo.svg>)

Poniżej znajdziesz swoje aktywności. Wejdź w jedną z nich, żeby zobaczyć zadania,
wysłać rozwiązanie albo sprawdzić ranking.

## Gdzie co jest

| Chcesz | Idź do |
|---|---|
| Przeczytać treść zadania | aktywność → **Zadania** |
| Wysłać rozwiązanie | aktywność → **Wyślij** |
| Sprawdzić werdykt i log kompilacji | aktywność → **Moje zgłoszenia** |
| Zapytać prowadzącego | aktywność → **Pytania i ogłoszenia** |
| Zmienić hasło lub dane | [Moje konto](/account) |

## O czym warto pamiętać

- **Werdykt dotyczy tej wersji zadania, w której go wystawiono.** Poprawka treści
  albo testów tworzy nową wersję i nie zmienia wyniku sprzed niej.
- **Limit czasu i pamięci widnieje przy treści zadania.** Jeśli rozwiązanie
  przekracza limit, system tego nie zaokrągla na Twoją korzyść.
- **Konto jest Twoje i tylko Twoje.** Udostępnienie go komuś innemu jest
  naruszeniem regulaminu.

## Coś nie działa

Napisz do administratora instancji: [ADRES KONTAKTOWY](mailto:kontakt@example.edu.pl).
Jeśli problem dotyczy konkretnego zadania, użyj pytania w tej aktywności — trafi
wprost do prowadzącego i zostanie przy zadaniu, którego dotyczy.
`;

const HOME_EN = `---
version: 1
---

# Welcome to AlgoJudge

> **Template.** Replace this page with your installation's own greeting: what
> happens here, who to write to, and what to keep in mind.

![A robot checking a solution](<logo.svg>)

Your activities are listed below. Open one to read its problems, send a solution
or look at the ranking.

## Where things are

| You want to | Go to |
|---|---|
| Read a problem statement | the activity → **Problems** |
| Send a solution | the activity → **Submit** |
| See a verdict and the compiler log | the activity → **My submissions** |
| Ask the staff | the activity → **Questions and announcements** |
| Change your password or details | [My account](/account) |

## Worth knowing

- **A verdict belongs to the version of the problem it was given against.** A
  correction to the statement or the tests publishes a new version and does not
  change a result from before it.
- **The time and memory limits are printed with the statement.** A solution over
  the limit is not rounded in your favour.
- **Your account is yours alone.** Sharing it with somebody else breaks the
  terms.

## Something is wrong

Write to the instance administrator: [CONTACT ADDRESS](mailto:kontakt@example.edu.pl).
If it concerns one problem, ask inside that activity instead — the question
reaches the staff and stays with the problem it is about.
`;

const PAGES: Record<"welcome" | "home", FixtureDocument> = {
    welcome: {
        kind: "welcome",
        content: WELCOME,
        translations: [{ language: "en", content: WELCOME_EN }],
        isTemplate: true,
    },
    home: {
        kind: "home",
        content: HOME,
        translations: [{ language: "en", content: HOME_EN }],
        isTemplate: true,
    },
};

export const instancePage = (kind: "welcome" | "home"): FixtureDocument => PAGES[kind];
