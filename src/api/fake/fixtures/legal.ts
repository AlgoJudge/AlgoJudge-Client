import { LegalDocument, LegalDocumentKind } from "../../CoreApi";

/**
 * The documents that ship with an instance, as blanks.
 *
 * Every one of them names `[OPERATOR]` rather than anybody real, and every one
 * is marked `isTemplate`. An operator who leaves them in place has published a
 * policy naming the wrong controller, so the screen says so where it is read and
 * the settings screen will say so where it is edited.
 *
 * They are `content.md` documents, so the renderer that draws a problem
 * statement draws these too — front matter, headings, tables and all.
 */

const TERMS = `---
version: 1
---

# Regulamin serwisu

> **Szablon.** Zastąp go regulaminem tej instalacji, zanim wpuścisz na nią
> użytkowników. Do czasu zastąpienia dokument nie ma mocy.

## 1. Postanowienia ogólne

Usługę świadczy **[OPERATOR]** (dalej „Operator"). Regulamin określa zasady
korzystania z instancji AlgoJudge pod adresem **[ADRES INSTANCJI]**.

## 2. Konta

1. Konta zakłada Operator albo pochodzą one od dostawcy tożsamości.
2. Konto jest przypisane do jednej osoby i nie może być udostępniane.
3. Operator może zablokować konto naruszające regulamin.

## 3. Zgłoszenia i ocenianie

1. Uczestnik odpowiada za treść przesłanego kodu.
2. Wynik oceny automatycznej jest wiążący w zakresie określonym regulaminem
   zawodów lub zasadami zaliczenia przedmiotu.
3. Regulamin zawodów jest odrębnym dokumentem i publikuje go organizator.

## 4. Odpowiedzialność

Operator nie ponosi odpowiedzialności za przerwy w działaniu wynikłe z przyczyn
od niego niezależnych.

## 5. Kontakt

**[ADRES KONTAKTOWY OPERATORA]**
`;

const PRIVACY = `---
version: 1
---

# Polityka prywatności

> **Szablon.** Zastąp go polityką tej instalacji. Dokument, który nie wskazuje
> rzeczywistego administratora danych, nie spełnia obowiązku informacyjnego.

## Administrator danych

Administratorem danych osobowych jest **[OPERATOR]**, kontakt:
**[ADRES KONTAKTOWY]**.

## Jakie dane przetwarzamy

| Dane | Skąd pochodzą | Po co |
|---|---|---|
| Login | od Operatora, od dostawcy tożsamości albo z formularza | identyfikacja konta i wyświetlanie autorstwa |
| Imię i nazwisko | opcjonalnie, od użytkownika lub Operatora | rozpoznawanie osoby przez prowadzącego |
| Adres e-mail | opcjonalnie | kontakt i odzyskiwanie dostępu |
| Zgłoszenia, kod źródłowy, wyniki | z korzystania z usługi | ocenianie i historia |
| Dziennik logowań | z korzystania z usługi | bezpieczeństwo konta |

## Nazwa wyświetlana

Wszędzie, gdzie pokazujemy osobę — ranking, pytania, lista zgłoszeń — widnieje
**imię i nazwisko, jeśli je podano, a login w przeciwnym razie**. To, czy login
identyfikuje konkretną osobę, zależy od zasad ich nadawania w tej instalacji.

## Jak długo przechowujemy dane

Domyślnie **rok**. Operator może ustawić inny okres.

## Usunięcie konta

Usunięcie konta jest **anonimizacją**: zgłoszenia i wyniki pozostają, ale pod
identyfikatorem, który nie wskazuje już osoby. Historia oceniania musi pozostać
spójna, a wyniki innych uczestników zależą od tego, co zostało ocenione.

## Twoje prawa

Dostęp do danych, sprostowanie, usunięcie, ograniczenie przetwarzania,
przenoszenie danych i sprzeciw. Eksport danych jest dostępny samoobsługowo na
ekranie konta.

## Ciasteczka

Używamy wyłącznie ciasteczka sesyjnego, niezbędnego do utrzymania zalogowania.
Nie wymaga ono zgody i nie służy do śledzenia.
`;

const COOKIES = `---
version: 1
---

# Ciasteczka

> **Szablon.** Uzupełnij, jeśli ta instalacja używa czegokolwiek poza
> ciasteczkiem sesyjnym.

Serwis używa jednego ciasteczka: **sesyjnego**, które utrzymuje zalogowanie.
Jest niezbędne do działania usługi, znika po zamknięciu przeglądarki i nie służy
do profilowania ani do analityki.

Jeżeli Operator doda analitykę lub inne narzędzia zewnętrzne, ten dokument oraz
zgoda na ich użycie muszą zostać uzupełnione **przed** ich uruchomieniem.
`;

const ACCESSIBILITY = `---
version: 1
---

# Deklaracja dostępności

> **Szablon.** Podmiot publiczny ma obowiązek opublikować własną deklarację —
> ta jej nie zastępuje.

**[OPERATOR]** zobowiązuje się zapewnić dostępność cyfrową tej instancji zgodnie
z ustawą o dostępności cyfrowej stron internetowych i aplikacji mobilnych
podmiotów publicznych.

- **Data publikacji:** [DATA]
- **Data ostatniego przeglądu:** [DATA]
- **Stan zgodności:** [do uzupełnienia po audycie]
- **Dane kontaktowe:** [ADRES KONTAKTOWY]

## Informacje zwrotne i dane kontaktowe

Każdy ma prawo wystąpić z żądaniem zapewnienia dostępności cyfrowej tej strony
lub jej elementu. Żądanie należy kierować na adres podany wyżej.
`;

const DOCUMENTS: Record<LegalDocumentKind, LegalDocument> = {
    terms: { kind: "terms", title: "Regulamin", content: TERMS, isTemplate: true },
    privacy: { kind: "privacy", title: "Polityka prywatności", content: PRIVACY, isTemplate: true },
    cookies: { kind: "cookies", title: "Ciasteczka", content: COOKIES, isTemplate: true },
    accessibility: { kind: "accessibility", title: "Deklaracja dostępności", content: ACCESSIBILITY, isTemplate: true },
};

export const legalDocument = (kind: LegalDocumentKind): LegalDocument | undefined => DOCUMENTS[kind];

export const legalDocumentKinds = (): LegalDocumentKind[] =>
    Object.keys(DOCUMENTS) as LegalDocumentKind[];
