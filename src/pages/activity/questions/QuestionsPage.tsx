import {Center, Input, Pagination, Text, Title} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { IconChevronDown } from "@tabler/icons-react";
import {useState} from "react";

import classes from "./QuestionsPage.module.css"
import {useNavigate} from "react-router-dom";

interface Question {
    topic: string;
    author: string;
    group: string | null;
    exercise: string | null;
    date: Date;
    isReaded: boolean;
}
type sortTypes = "Date"|"Topic"|"Group"|"Exercise"|"Author"

type Sort = {type: sortTypes, direction: "ASC" | "DESC"}

const sortOptions: Sort[] = [
    {type: "Date", direction: "ASC"},
    {type: "Date", direction: "DESC"},
    {type: "Topic", direction: "ASC"},
    {type: "Topic", direction: "DESC"},
    {type: "Group", direction: "ASC"},
    {type: "Group", direction: "DESC"},
    {type: "Exercise", direction: "ASC"},
    {type: "Exercise", direction: "DESC"},
    {type: "Author", direction: "ASC"},
    {type: "Author", direction: "DESC"},
]

const questionsData: Question[] = [
    {
        topic: "Błąd w treści zadania",
        author: "Jan Kowalski",
        group: "Lekcja 1",
        exercise: "Sprawdzanie spójności grafu",
        date: new Date("2025-03-22T10:00:00.000Z"),
        isReaded: false,
    },
    {
        topic: "xDDDDDDDD",
        author: "Jan Kowalski",
        group: "Lekcja 1",
        exercise: "Sprawdzanie spójności grafu",
        date: new Date("2025-01-22T10:00:00.000Z"),
        isReaded: false,
    },
    {
        topic: "Błąd w treści zadania",
        author: "Jan Kowalski",
        group: null,
        exercise: "Sprawdzanie spójności grafu",
        date: new Date("2025-03-22T10:00:00.000Z"),
        isReaded: false,
    },
    {
        topic: "Niejasne sformułowanie pytania",
        author: "Anna Nowak",
        group: "Lekcja 1",
        exercise: "Minimalne drzewo rozpinające Minimalne",
        date: new Date("2025-03-20T14:30:00.000Z"),
        isReaded: false,
    },
    {
        topic: "Błąd w teście przykładowym",
        author: "Piotr Wiśniewski",
        group: "Lekcja 2",
        exercise: "Najkrótsza ścieżka w grafie",
        date: new Date("2025-03-18T09:15:00.000Z"),
        isReaded: true,
    },
    {
        topic: "Brak pełnej specyfikacji",
        author: "Katarzyna Lewandowska",
        group: "Lekcja 2",
        exercise: "Sortowanie topologiczne",
        date: new Date("2025-03-21T16:45:00.000Z"),
        isReaded: false,
    },
    {
        topic: "Niepoprawny wynik testowy",
        author: "Marek Dąbrowski",
        group: "Lekcja 2",
        exercise: "Algorytm Dijkstry",
        date: new Date("2025-03-19T11:20:00.000Z"),
        isReaded: true,
    },
    {
        topic: "Brak opisu wejścia i wyjścia",
        author: "Ewa Kaczmarek",
        group: "Lekcja 3",
        exercise: "Maksymalny przepływ",
        date: new Date("2025-03-17T08:05:00.000Z"),
        isReaded: false,
    },
    {
        topic: "Błąd w przykładowym rozwiązaniu",
        author: "Tomasz Zieliński",
        group: "Lekcja 3",
        exercise: "Kolorowanie grafu",
        date: new Date("2025-03-23T13:55:00.000Z"),
        isReaded: false,
    },
    {
        topic: "Niepoprawny opis algorytmu",
        author: "Barbara Wójcik",
        group: "Lekcja 3",
        exercise: "Drzewo przedziałowe",
        date: new Date("2025-03-16T15:10:00.000Z"),
        isReaded: true,
    },
    {
        topic: "Złe sformułowanie warunków zadania",
        author: "Krzysztof Pawlak",
        group: "Lekcja 3",
        exercise: "Znajdowanie mostów w grafie",
        date: new Date("2025-03-24T17:30:00.000Z"),
        isReaded: false,
    },
    {
        topic: "Nieścisłość w podanym kodzie",
        author: "Agnieszka Lis",
        group: "Lekcja 3",
        exercise: "Przeszukiwanie BFS",
        date: new Date("2025-03-15T12:40:00.000Z"),
        isReaded: true,
    },
    {
        topic: "Błąd w definicji problemu",
        author: "Paweł Szymański",
        group: "Lekcja 4",
        exercise: null,
        date: new Date("2025-03-25T19:00:00.000Z"),
        isReaded: false,
    },
];

function questionSort(posts: Question[], option: Sort): Question[]{
    if(option.type === "Date")
        return posts.sort((a,b) => option.direction === "ASC" ? a.date > b.date ? 1:-1 : a.date > b.date ? -1:1);
    else if(option.type === "Topic")
        return posts.sort((a,b) => {
            const A = a.topic.toUpperCase()
            const B = b.topic.toUpperCase()
            return option.direction === "ASC" ? A > B ? 1:-1 : A > B ? -1:1
        });
    else if(option.type === "Exercise")
        return posts.sort((a,b) => {
            const A = (a.exercise ?? "").toUpperCase()
            const B = (b.exercise ?? "").toUpperCase()
            return option.direction === "ASC" ? A > B ? 1:-1 : A > B ? -1:1
        });
    else if(option.type === "Author")
        return posts.sort((a,b) => {
            const A = a.author.toUpperCase()
            const B = b.author.toUpperCase()
            return option.direction === "ASC" ? A > B ? 1:-1 : A > B ? -1:1
        });
    else
        return posts.sort((a,b) => {
            const A = (a.group ?? "").toUpperCase()
            const B = (b.group ?? "").toUpperCase()
            return option.direction === "ASC" ? A > B ? 1:-1 : A > B ? -1:1
        });
}

export default function QuestionsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    //States
    const [questions, setQuestions] = useState<Question[]>(questionsData)

    const [search, setSearch] = useState<string>("");
    const [groupFilter, setGroupFilter] = useState<string>("none");
    const [exerciseFilter, setExerciseFilter] = useState<string>("none");
    const [sort, setSort] = useState<Sort>({type: "Date", direction: "DESC"})

    const [page, setPage] = useState<number>(1);

    //Handlers
    const sortHandler = (value: string) => {
        const newSort : Sort = {type: value.replace("DESC","").replace("ASC","") as sortTypes, direction: value.includes("ASC") ? "ASC" : "DESC" };
        setSort(newSort);
        setQuestions(prevState => questionSort(prevState, newSort));
    }
    const onClickSortHandler = (type: sortTypes) => {

        setSort(prevState => ({type: type, direction: type === prevState.type ? prevState.direction === "ASC" ? "DESC" : "ASC" : "ASC"} as Sort));
    }
    const groupFilterHandler = (value :string) => {
        setGroupFilter(value);
        setExerciseFilter('none');
    }

    //JSX
    const groupOptionsElement = [... new Set(questions.map(q => q.group))]
        .sort((a,b)=> (a ?? "") > (b ?? "") ? 1:-1)
        .map((group) =>
        (<option key={group ?? "GeneralG"} value={`${group ?? null}`}>{group ?? t("General")}</option>));

    const exerciseOptionsElement = [... new Set((groupFilter === 'none' ? questions : questions.filter(e=> (e.group ?? 'null') === groupFilter)).map(q => q.exercise))]
        .sort((a,b)=> (a ?? "") > (b ?? "") ? 1:-1)
        .map((exercise) =>
        (<option key={exercise ?? "GeneralE"} value={`${exercise ?? null}`}>{exercise ?? t("General")}</option>));

    const sortOptionsElement = sortOptions.map((element) =>
        (<option key={element.type + element.direction} value={element.type + element.direction}>
            {t(`${element.type}`)}
            {element.direction === "ASC" ? "⭡" : "⭣"}
        </option>));

    const questionElemets =
        questionSort(questions,sort).filter(q => q.topic.toUpperCase().includes(search.toUpperCase()))
            .slice(10 * (page-1),10 * page)
            .filter(q => (q.group ?? "null") === groupFilter || groupFilter === "none")
            .filter(q => (q.exercise ?? "null") === exerciseFilter || exerciseFilter === "none")
            .map(((q,i) => (
                <div key={i} style={q.isReaded ? {backgroundColor: "#D9D9D9"} : {backgroundColor: "#f0f0f0"}} className={classes.question}>
                    <Text title={q.topic} onClick={() => navigate(`./${q.topic}`)}>{q.topic}</Text>
                    <Text title={q.author}>{q.author}</Text>
                    <Text title={q.group ?? "ogólne"}>{q.group}</Text>
                    <Text title={q.exercise ?? "ogólne"}>{q.exercise}</Text>
                    <Text title={`${q.date.getUTCDate()}.${(q.date.getUTCMonth() < 9 ? "0" : "") + (q.date.getUTCMonth()+1)}.${q.date.getUTCFullYear()}`}>
                        {`${q.date.getUTCDate()}.${(q.date.getUTCMonth() < 9 ? "0" : "") + (q.date.getUTCMonth()+1)}.${q.date.getUTCFullYear()}`}
                    </Text>
                </div>
            )))

    return (
        <>
            <Title>{t("Questions and announcements")}</Title>
            <div className={classes.searchElement}>
                <div className={classes.left}>
                    <Input
                        value={search}
                        onChange={e=> setSearch(e.target.value)}
                        className={classes.searchBar}
                        placeholder={t("Search by topic") + " ..."}
                    />
                    <Input
                        className={classes.group}
                        value={groupFilter}
                        onChange={e=> groupFilterHandler(e.target.value)}
                        component="select"
                        rightSection={<IconChevronDown size={14} stroke={1.5}/>}
                        pointer
                        mt="md">
                            <option value="none">{t("All groups")}</option>
                            {groupOptionsElement}
                    </Input>
                    <Input
                        className={classes.exercise}
                        disabled={exerciseOptionsElement.length < 2}
                        value={exerciseFilter}
                        onChange={e=>setExerciseFilter(e.target.value)}
                        component="select"
                        rightSection={<IconChevronDown size={14} stroke={1.5}/>}
                        pointer
                        mt="md">
                            <option value="none">{t("All exercise")}</option>
                            {exerciseOptionsElement}
                    </Input>
                </div>
                <div className={classes.right}>
                    <Text>{t("Sort") + ": "}</Text>
                    <Input
                        value={sort.type+sort.direction}
                        onChange={e=> sortHandler(e.target.value)}
                        component="select"
                        rightSection={<IconChevronDown size={14} stroke={1.5}/>}
                        pointer mt="md"
                    >
                        {sortOptionsElement}
                    </Input>
                </div>
            </div>
            <div className={classes.questionHeader}>
                {["Topic","Author","Group","Exercise","Date"].map(e=> (
                    <Title key={e} size="h4" onClick={() => onClickSortHandler(e as sortTypes)}>
                        {t(e)}
                    </Title>
                ))}
            </div>
            <div className={classes.questions}>
                {questionElemets}
            </div>
            <Center><Pagination total={Math.trunc(questions.length/10 + 1)} value={page} onChange={e=>setPage(e)} mx="auto" /></Center>
        </>
    );
}
