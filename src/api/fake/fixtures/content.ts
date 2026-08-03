/**
 * Statement documents for the fake data.
 *
 * These are `content.json` documents — the project's own block format, stored as
 * a well-known attachment name and rendered by the Client. They are untyped here
 * on purpose: `ProblemDetail.content` is `unknown` in the contract, and the
 * types, the validator and the renderers arrive with the format specification.
 */

export const graphConnectivityStatement = {
    version: 1,
    blocks: [
        {
            type: "paragraph",
            text: "Dany jest graf nieskierowany o $n$ wierzchołkach i $m$ krawędziach. Sprawdź, czy graf jest spójny.",
        },
        { type: "heading", level: 2, text: "Wejście" },
        {
            type: "paragraph",
            text: "W pierwszym wierszu dwie liczby $n$ i $m$. W kolejnych $m$ wierszach po dwie liczby $a_i$ i $b_i$ oznaczające krawędź.",
        },
        {
            type: "latex",
            text: "1 \\le n \\le 10^5, \\quad 0 \\le m \\le 2 \\cdot 10^5",
        },
        { type: "heading", level: 2, text: "Wyjście" },
        {
            type: "paragraph",
            text: "Jedno słowo: TAK, jeśli graf jest spójny, albo NIE w przeciwnym przypadku.",
        },
        {
            type: "sample",
            input: "4 3\n1 2\n2 3\n3 4",
            output: "TAK",
            explanation: "Wszystkie wierzchołki leżą na jednej ścieżce.",
        },
        {
            type: "sample",
            input: "4 2\n1 2\n3 4",
            output: "NIE",
        },
    ],
};

export const shortestPathStatement = {
    version: 1,
    blocks: [
        {
            type: "paragraph",
            text: "Znajdź najkrótszą ścieżkę z wierzchołka $s$ do wierzchołka $t$ w grafie ważonym o nieujemnych wagach.",
        },
        { type: "embed", attachment: "graf-przyklad.png", caption: "Przykładowy graf wejściowy" },
        { type: "heading", level: 2, text: "Ograniczenia" },
        { type: "latex", text: "1 \\le n \\le 2 \\cdot 10^5, \\quad 1 \\le w_i \\le 10^9" },
        {
            type: "sample",
            input: "3 3 1 3\n1 2 5\n2 3 5\n1 3 11",
            output: "10",
        },
        { type: "heading", level: 2, text: "Uwagi" },
        {
            type: "codeblock",
            language: "cpp",
            text: "// suma wag może przekroczyć zakres int\nlong long dist[MAXN];",
        },
    ],
};

export const topologicalSortStatement = {
    version: 1,
    blocks: [
        {
            type: "paragraph",
            text: "Posortuj topologicznie dany graf skierowany. Jeśli graf zawiera cykl, wypisz CYKL.",
        },
        {
            type: "sample",
            input: "3 2\n1 2\n2 3",
            output: "1 2 3",
        },
    ],
};

export const loopsStatement = {
    version: 1,
    blocks: [
        { type: "heading", level: 2, text: "Zadanie na zajęcia" },
        {
            type: "paragraph",
            text: "Napisz program, który wczytuje liczbę $n$ i wypisuje sumę liczb od $1$ do $n$.",
        },
        {
            type: "sample",
            input: "5",
            output: "15",
        },
    ],
};

export const arraysStatement = {
    version: 1,
    blocks: [
        {
            type: "paragraph",
            text: "Wczytaj tablicę $n$ liczb i wypisz ją w odwrotnej kolejności.",
        },
        {
            type: "sample",
            input: "4\n1 2 3 4",
            output: "4 3 2 1",
        },
    ],
};

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

export const contestRules = {
    version: 1,
    blocks: [
        { type: "heading", level: 1, text: "Regulamin zawodów" },
        {
            type: "paragraph",
            text: "Zawody trwają pięć godzin. Każdy zespół pracuje przy jednym stanowisku.",
        },
        { type: "heading", level: 2, text: "Punktacja" },
        {
            type: "paragraph",
            text: "O miejscu decyduje liczba rozwiązanych zadań, a przy równej liczbie — sumaryczny czas z karą $20$ minut za każde wcześniejsze błędne zgłoszenie.",
        },
        {
            type: "paragraph",
            text: "Ranking jest zamrażany na ostatnią godzinę i odmrażany po zakończeniu zawodów.",
        },
    ],
};

export const courseRules = {
    version: 1,
    blocks: [
        { type: "heading", level: 1, text: "Zasady zaliczenia" },
        {
            type: "paragraph",
            text: "Zadania z każdych zajęć należy oddać przed terminem podanym przy sekcji. Zgłoszenia po terminie nie są przyjmowane.",
        },
    ],
};
