import { InstanceDocument } from "../../CoreApi";

/**
 * The two front pages that ship with an instance.
 *
 * The same arrangement as the legal documents: `content.md` the operator owns,
 * drawn by the renderer that draws a problem statement, shipped as a template
 * that says so. One page for a visitor who has not signed in and one for a
 * person who has, because the two have entirely different questions — "what is
 * this and may I have an account" against "where do I go now".
 *
 * Two rules shaped the text.
 *
 * A statement may not point outside itself, and that includes application paths:
 * the validator refuses `[Zaloguj](/login)` exactly as it refuses a link to
 * another host. So the pages describe where a control is and the screen draws
 * the control — which is the right division anyway, since a button that knows
 * whether somebody is signed in is not something an operator should have to
 * maintain in prose.
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
| Prowadzący | Napisz do administratora instancji: **[ADRES KONTAKTOWY]** |

## Co znajdziesz po zalogowaniu

- listę swoich aktywności — zawodów, kursów, zestawów treningowych,
- treści zadań wraz z limitami i przykładami do pobrania,
- formularz wysyłania rozwiązań i historię swoich zgłoszeń,
- ranking oraz pytania do prowadzącego, jeśli aktywność je udostępnia.

## Zanim zaczniesz

Zapoznaj się z regulaminem i polityką prywatności tej instalacji — odnośniki do
nich są w stopce. Zasady konkretnych zawodów publikuje organizator w samej
aktywności.
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
| Zmienić hasło lub dane | menu z Twoim nazwiskiem → **Moje konto** |

## O czym warto pamiętać

- **Werdykt dotyczy tej wersji zadania, w której go wystawiono.** Poprawka treści
  albo testów tworzy nową wersję i nie zmienia wyniku sprzed niej.
- **Limit czasu i pamięci widnieje przy treści zadania.** Jeśli rozwiązanie
  przekracza limit, system tego nie zaokrągla na Twoją korzyść.
- **Konto jest Twoje i tylko Twoje.** Udostępnienie go komuś innemu jest
  naruszeniem regulaminu.

## Coś nie działa

Napisz do administratora instancji: **[ADRES KONTAKTOWY]**. Jeśli problem dotyczy
konkretnego zadania, użyj pytania w tej aktywności — trafi wprost do prowadzącego
i zostanie przy zadaniu, którego dotyczy.
`;

const PAGES: Record<"welcome" | "home", InstanceDocument> = {
    welcome: { kind: "welcome", content: WELCOME, isTemplate: true },
    home: { kind: "home", content: HOME, isTemplate: true },
};

export const instancePage = (kind: "welcome" | "home"): InstanceDocument => PAGES[kind];
