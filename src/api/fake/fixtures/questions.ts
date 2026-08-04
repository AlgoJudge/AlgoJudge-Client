import { ManagedQuestion } from "../../ManagerApi";
import { CONTEST_ID, COURSE_ID } from "./activities";

/**
 * Questions and announcements across activities.
 *
 * Bodies are plain text with line breaks preserved, not the statement format: a
 * question is written in a hurry during a contest, and a broken formula in one
 * would be a worse failure than no formula at all.
 *
 * Mixed on purpose: unanswered ones a manager must find first, an answer sent to
 * one team only, one published as an FAQ, and announcements with and without a
 * series — which is every path the screen has to draw.
 */

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();

export const createQuestions = (): ManagedQuestion[] => [
    {
        id: "mq-1",
        activityId: CONTEST_ID,
        activitySlug: "AMMPZ-2019",
        kind: "question",
        topic: "Zadanie A — czy graf może być pusty?",
        body: "Czy w zadaniu A możliwe jest n = 0? Ograniczenia mówią o n co najmniej 1, ale chcemy się upewnić.",
        authorUserId: "user-kowalski",
        authorName: "Jan Kowalski",
        createdAt: minutesAgo(35),
        seriesId: "series-r1",
        seriesName: "Runda 1",
        seriesProblemId: "sp-series-r1-A",
        problemSlug: "A",
        problemName: "Spójność grafu",
        // Answered and published: everyone had the same doubt, which is what
        // publishing is for.
        answer: {
            body: "Nie, n jest co najmniej 1 zgodnie z ograniczeniami. Treść pozostaje bez zmian.",
            authorName: "Amy Horsefighter",
            answeredAt: minutesAgo(28),
        },
        isPublished: true,
        readCount: 31,
    },
    {
        id: "mq-2",
        activityId: CONTEST_ID,
        activitySlug: "AMMPZ-2019",
        kind: "question",
        topic: "Limit pamięci dla Javy",
        body: "Czy limit 256 MB obejmuje pamięć maszyny wirtualnej Javy?",
        authorUserId: "user-wisniewski",
        authorName: "Tomasz Wiśniewski",
        createdAt: minutesAgo(12),
        seriesId: "series-r1",
        seriesName: "Runda 1",
        // Waiting: the case the screen must make impossible to miss.
        isPublished: false,
        readCount: 0,
    },
    {
        id: "mq-3",
        activityId: CONTEST_ID,
        activitySlug: "AMMPZ-2019",
        kind: "question",
        topic: "Nasze zgłoszenie utknęło w kolejce",
        body: "Zgłoszenie z 17:12 wisi w kolejce od dziesięciu minut.",
        authorUserId: "user-nowak",
        authorName: "Anna Nowak",
        createdAt: minutesAgo(8),
        // Answered but not published: the answer concerns one team's submission
        // and would tell everyone else nothing.
        answer: {
            body: "Runner zgłosił błąd paczki, zadanie zostało zakolejkowane ponownie. Przepraszamy.",
            authorName: "Amy Horsefighter",
            answeredAt: minutesAgo(5),
        },
        isPublished: false,
        readCount: 1,
    },
    {
        id: "mq-4",
        activityId: CONTEST_ID,
        activitySlug: "AMMPZ-2019",
        kind: "announcement",
        topic: "Ranking zamrożony od 20:00",
        body: "Ranking zostanie zamrożony na ostatnią godzinę zawodów i odmrożony po ich zakończeniu.",
        createdAt: minutesAgo(60),
        isPublished: true,
        readCount: 40,
    },
    {
        id: "mq-5",
        activityId: COURSE_ID,
        activitySlug: "PROG-1-LA",
        kind: "announcement",
        topic: "Zajęcia 2 — termin przedłużony",
        body: "Termin oddania zadań z zajęć 2 przesunięty o trzy dni.",
        createdAt: minutesAgo(2880),
        seriesId: "series-w2",
        seriesName: "Zajęcia 2 — rekurencja",
        isPublished: true,
        readCount: 24,
    },
    {
        id: "mq-6",
        activityId: COURSE_ID,
        activitySlug: "PROG-1-LA",
        kind: "question",
        topic: "Czy można oddać w Pythonie 3.12?",
        body: "W konfiguracji widzę tylko python. Która to wersja?",
        authorUserId: "user-nowak",
        authorName: "Anna Nowak",
        createdAt: minutesAgo(1440),
        seriesId: "series-w1",
        seriesName: "Zajęcia 1 — podstawy",
        isPublished: false,
        readCount: 0,
    },
];
