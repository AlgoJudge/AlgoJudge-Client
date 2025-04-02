import { Title } from "@mantine/core";
import classes from "./RankingPage.module.css";
import { useTranslation } from "react-i18next";

interface Contestant {
	id: string;
	name: string;
	completedProblems?: FinishedProblem[];
}

interface FinishedProblem {
	id: string;
	points: number;
}

interface Problem {
	id: string;
	name: string;
}

interface Model {
	activityName: string;
	problems: Problem[];
	contestants: Contestant[];
}

const data: Model = {
	activityName: "Konkurs 1",
	problems: [
		{
			id: "id1",
			name: "Zadanie 1",
		},
		{
			id: "id2",
			name: "Zadanie 2",
		},
		{
			id: "id3",
			name: "Zadanie 3",
		},
		{
			id: "id4",
			name: "Zadanie 4",
		},
	],
	contestants: [
		{
			id: "C1",
			name: "Contestant 1",
			completedProblems: [
				{
					id: "id1",
					points: 80,
				},
				{
					id: "id2",
					points: 50,
				},
				{
					id: "id4",
					points: 100,
				},
			],
		},
		{
			id: "C2",
			name: "Contestant 2",
			completedProblems: [
				{
					id: "id1",
					points: 20,
				},
				{
					id: "id3",
					points: 10,
				},
				{
					id: "id4",
					points: 600,
				},
			],
		},
		{
			id: "C3",
			name: "Contestant 3",
			completedProblems: [
				{
					id: "id1",
					points: 100,
				},
				{
					id: "id2",
					points: 100,
				},
				{
					id: "id3",
					points: 90,
				},
				{
					id: "id4",
					points: 100,
				},
			],
		},
	],
};

export default function RankingPage() {
	const { t } = useTranslation();
	return (
		<>
			<Title>{t("Ranking")}</Title>
		</>
	);
}
