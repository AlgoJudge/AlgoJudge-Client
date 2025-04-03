import { Title } from "@mantine/core";
import classes from "./RankingPage.module.css";
import { useTranslation } from "react-i18next";

import { Table } from "@mantine/core";

interface Contestant {
	id: string;
	name: string;
	completedProblems: FinishedProblem[];
}

interface FinishedProblem {
	id: string;
	points: number;
}

interface Round {
	id: string;
	name: string;
}

interface Model {
	activityName: string;
	rounds: Round[];
	contestants: Contestant[];
}

const data: Model = {
	activityName: "Contest 1",
	rounds: [
		{
			id: "id1",
			name: "Round 1",
		},
		{
			id: "id2",
			name: "Round 2",
		},
		{
			id: "id3",
			name: "Round 3",
		},
		{
			id: "id4",
			name: "Round 4",
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

const rows = data.contestants.map((contestant) => {
	let completedSum: number = 0;
	let pointsSum: number = 0;
	contestant.completedProblems.forEach((problem) => {
		completedSum++;
		pointsSum += problem.points;
	});

	return (
		<Table.Tr key={contestant.id}>
			<Table.Td>{contestant.name}</Table.Td>
			<Table.Td>{`${completedSum}/${data.rounds.length}`}</Table.Td>
			<Table.Td>{pointsSum}</Table.Td>
			{data.rounds.map((problem) => (
				<Table.Td>
					{
						contestant.completedProblems.find((user) => user.id === problem.id)
							?.points
					}
				</Table.Td>
			))}
		</Table.Tr>
	);
});

export default function RankingPage() {
	const { t } = useTranslation();
	return (
		<>
			<Title>{t("Ranking")}</Title>

			<Table>
				<Table.Thead>
					<Table.Tr>
						<Table.Th>User</Table.Th>
						<Table.Th>Completed Problems</Table.Th>
						<Table.Th>Sum</Table.Th>
						{data.rounds.map((problem) => (
							<Table.Th>{problem.name}</Table.Th>
						))}
					</Table.Tr>
				</Table.Thead>
				<Table.Tbody>{rows}</Table.Tbody>
			</Table>
		</>
	);
}
