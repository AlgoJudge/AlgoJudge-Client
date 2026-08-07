/**
 * Statement documents for the fake data.
 *
 * These are `content.md` documents — Markdown with the project's own additions:
 * front matter carrying the format version, `$…$` and `$$…$$` for mathematics,
 * and adjacent ```in / ```out fences for a sample. They are untyped here on
 * purpose: `ProblemDetail.content` is `unknown` in the contract, and it is the
 * validator, not the type system, that decides whether a document is renderable.
 */

export const graphConnectivityStatement = `---
version: 1
---

Dany jest graf nieskierowany o $n$ wierzchołkach i $m$ krawędziach. Sprawdź, czy
graf jest **spójny**.

## Wejście

W pierwszym wierszu dwie liczby $n$ i $m$. W kolejnych $m$ wierszach po dwie
liczby $a_i$ i $b_i$ oznaczające krawędź.

$$
1 \\le n \\le 10^5, \\quad 0 \\le m \\le 2 \\cdot 10^5
$$

## Wyjście

Jedno słowo: \`TAK\`, jeśli graf jest spójny, albo \`NIE\` w przeciwnym przypadku.

## Przykłady

\`\`\`in
4 3
1 2
2 3
3 4
\`\`\`

\`\`\`out
TAK
\`\`\`

Wszystkie wierzchołki leżą na jednej ścieżce.

\`\`\`in
4 2
1 2
3 4
\`\`\`

\`\`\`out
NIE
\`\`\`

## Ocenianie

| Grupa | Ograniczenie | Punkty |
|---|---|---|
| 1 | $n \\le 100$ | 30 |
| 2 | $n \\le 10^4$ | 30 |
| 3 | bez dodatkowych ograniczeń | 40 |
`;

/** The same statement in English, stored as `content-en.md` beside the default. */
export const graphConnectivityStatementEn = `---
version: 1
---

You are given an undirected graph with $n$ vertices and $m$ edges. Decide whether
the graph is **connected**.

## Input

The first line holds two integers $n$ and $m$. Each of the next $m$ lines holds
two integers $a_i$ and $b_i$ describing an edge.

$$
1 \\le n \\le 10^5, \\quad 0 \\le m \\le 2 \\cdot 10^5
$$

## Output

One word: \`TAK\` if the graph is connected, \`NIE\` otherwise.

## Examples

\`\`\`in
4 3
1 2
2 3
3 4
\`\`\`

\`\`\`out
TAK
\`\`\`

Every vertex lies on a single path.

## Scoring

| Group | Constraint | Points |
|---|---|---|
| 1 | $n \\le 100$ | 30 |
| 2 | $n \\le 10^4$ | 30 |
| 3 | no further constraints | 40 |
`;

export const shortestPathStatement = `---
version: 1
---

Znajdź najkrótszą ścieżkę z wierzchołka $s$ do wierzchołka $t$ w grafie ważonym
o nieujemnych wagach[^wagi].

[^wagi]: Ujemne wagi zmieniłyby zadanie w wariant Bellmana-Forda i są tu wykluczone.

![Przykładowy graf wejściowy](graf-przyklad.png)

## Ograniczenia

$$
1 \\le n \\le 2 \\cdot 10^5, \\quad 1 \\le w_i \\le 10^9
$$

\`\`\`in
3 3 1 3
1 2 5
2 3 5
1 3 11
\`\`\`

\`\`\`out
10
\`\`\`

## Uwagi

\`\`\`cpp
// suma wag może przekroczyć zakres int
long long dist[MAXN];
\`\`\`
`;

export const topologicalSortStatement = `---
version: 1
---

Posortuj topologicznie dany graf skierowany. Jeśli graf zawiera cykl, wypisz
\`CYKL\`.

\`\`\`in
3 2
1 2
2 3
\`\`\`

\`\`\`out
1 2 3
\`\`\`
`;

export const loopsStatement = `---
version: 1
---

## Zadanie na zajęcia

Napisz program, który wczytuje liczbę $n$ i wypisuje sumę liczb od $1$ do $n$.

\`\`\`in
5
\`\`\`

\`\`\`out
15
\`\`\`
`;

export const arraysStatement = `---
version: 1
---

Wczytaj tablicę $n$ liczb i wypisz ją w odwrotnej kolejności.

\`\`\`in
4
1 2 3 4
\`\`\`

\`\`\`out
4 3 2 1
\`\`\`
`;

/**
 * A statement whose type the Client does not know. Used to prove the controlled
 * fallback: an unsupported type must render a notice, never break the screen.
 */
export const unknownTypeStatement = {
    version: 1,
    interactive: {
        protocol: "stdio-duplex",
        turns: 30,
    },
    prompt: "Zgadnij liczbę, zadając pytania o przedziały.",
};

export const contestRules = `---
version: 1
---

# Regulamin zawodów

Zawody trwają pięć godzin. Każdy zespół pracuje przy jednym stanowisku.

## Punktacja

O miejscu decyduje liczba rozwiązanych zadań, a przy równej liczbie —
sumaryczny czas z karą $20$ minut za każde wcześniejsze błędne zgłoszenie.

Ranking jest zamrażany na ostatnią godzinę i odmrażany po zakończeniu zawodów.
`;

export const courseRules = `---
version: 1
---

# Zasady zaliczenia

Zadania z każdych zajęć należy oddać przed terminem podanym przy sekcji.
Zgłoszenia po terminie nie są przyjmowane.
`;

export const courseRulesEn = `---
version: 1
---

# Terms of assessment

The problems for each class are due before the deadline shown on the section.
Submissions after the deadline are not accepted.
`;

/**
 * What somebody **not enrolled** reads on an activity's own page: enough to
 * decide whether they are in the right place, and nothing that being enrolled
 * would have given them.
 */
export const courseWelcome = `---
version: 1
---

# Programowanie 1 — grupa LA

Zajęcia z podstaw programowania dla pierwszego roku. Rozwiązania oddaje się
w tym serwisie; ocena z zajęć jest sumą punktów z zadań.

Jeżeli jesteś w tej grupie, zapisz się poniżej hasłem, które dostałeś na
zajęciach.
`;

export const courseWelcomeEn = `---
version: 1
---

# Programming 1 — group LA

An introduction to programming for first-year students. Solutions are handed in
here, and the mark for the course is the sum of the problems' scores.

If you are in this group, enrol below with the password you were given in class.
`;

/** And what a participant reads there instead, once they are in. */
export const courseHome = `---
version: 1
---

# Witamy na zajęciach

Zadania z bieżących zajęć znajdziesz w sekcji **Zadania**. Terminy są podane
przy każdej sekcji i po ich upływie zgłoszenia nie są przyjmowane.

Pytania zadawaj przez **Pytania i ogłoszenia** — odpowiedź trafia do wszystkich,
jeżeli dotyczy całej grupy.
`;

export const courseHomeEn = `---
version: 1
---

# Welcome to the course

The problems for the current class are under **Problems**. Each section carries
its own deadline, and nothing is accepted after it.

Ask through **Questions and announcements** — an answer that concerns the whole
group is published to it.
`;

/** An open activity anybody may join, so its page is mostly an invitation. */
export const practiceWelcome = `---
version: 1
---

# Trening otwarty

Zbiór zadań archiwalnych, otwarty dla wszystkich. Zapisz się i rozwiązuj we
własnym tempie — nie ma terminów ani limitu zgłoszeń.
`;
