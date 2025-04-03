import { Title } from "@mantine/core";
import classes from "./RankingPage.module.css";
import { useTranslation } from "react-i18next";

import { Table } from "@mantine/core";
import { useState } from "react";

interface Contestant {
	id: string;
	name: string;
	completedRounds: ContestantRound[];
}

interface ContestantRound {
	id: string;
	completedProblems: ContestantProblem[];
}

interface ContestantProblem {
	id: string;
	points: number;
}

interface Round {
	id: string;
	name: string;
	problems: Problem[];
}

interface Problem {
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
			id: "r1",
			name: "Round 1",
			problems: [
				{
					id: "r1p1",
					name: "R1 Problem 1",
				},
				{
					id: "r1p2",
					name: "R1 Problem 2",
				},
			],
		},
		{
			id: "r2",
			name: "Round 2",
			problems: [
				{
					id: "r2p1",
					name: "R2 Problem 1",
				},
				{
					id: "r2p2",
					name: "R2 Problem 2",
				},
			],
		},
		{
			id: "r3",
			name: "Round 3",
			problems: [
				{
					id: "r3p1",
					name: "R3 Problem 1",
				},
				{
					id: "r3p2",
					name: "R3 Problem 2",
				},
				{
					id: "r3p2",
					name: "R3 Problem 2",
				},
			],
		},
	],
	contestants: [
		{
			id: "C1",
			name: "Contestant 1",
			completedRounds: [
				{
					id: "r1",
					completedProblems: [
						{
							id: "r1p1",
							points: 30,
						},
						{
							id: "r1p2",
							points: 60,
						},
					],
				},
				{
					id: "r2",
					completedProblems: [
						{
							id: "r2p1",
							points: 80,
						},
					],
				},
			],
		},
		{
			id: "C2",
			name: "Contestant 2",
			completedRounds: [
				{
					id: "r2",
					completedProblems: [
						{
							id: "r2p1",
							points: 50,
						},
						{
							id: "r2p2",
							points: 30,
						},
					],
				},
			],
		},
		{
			id: "C3",
			name: "Contestant 3",
			completedRounds: [
				{
					id: "r1",
					completedProblems: [
						{
							id: "r1p1",
							points: 100,
						},
						{
							id: "r1p2",
							points: 100,
						},
					],
				},
				{
					id: "r2",
					completedProblems: [
						{
							id: "r2p1",
							points: 70,
						},
						{
							id: "r2p2",
							points: 90,
						},
					],
				},
			],
		},
	],
};

export default function RankingPage() {
	const { t } = useTranslation();
	const [expandedRound, setExpandedRound] = useState("");

	data.contestants.sort((a: Contestant, b: Contestant) => {
		return sumPoints(b) - sumPoints(a);
	});

	function sumPoints(contestant: Contestant): number {
		let contestPoints: number = 0;

		contestant.completedRounds.map((round) => {
			round.completedProblems.map(
				(problem) => (contestPoints += problem.points)
			);
		});

		return contestPoints;
	}

	const rows = data.contestants.map((contestant, index) => {
		let contestPoints: number = 0;

		const roundRows = data.rounds.map((round) => {
			const contestantRound = contestant.completedRounds.find(
				(cRound) => cRound.id === round.id
			);
			let roundPoints: number = 0;

			const problemPoints = round.problems.map((problem) => {
				const contestantProblem = contestantRound?.completedProblems.find(
					(cProblem) => cProblem.id === problem.id
				);
				roundPoints += contestantProblem?.points || 0;

				return (
					expandedRound === round.id && (
						<Table.Td>{contestantProblem?.points || "-"}</Table.Td>
					)
				);
			});

			contestPoints += roundPoints;

			return (
				<>
					<Table.Td>{roundPoints}</Table.Td>
					{problemPoints}
				</>
			);
		});

		return (
			<Table.Tr key={contestant.id}>
				<Table.Td>{index + 1}</Table.Td>
				<Table.Td>{contestant.name}</Table.Td>
				<Table.Td>{`${contestant.completedRounds.length}/${data.rounds.length}`}</Table.Td>
				<Table.Td>{contestPoints}</Table.Td>
				{roundRows}
			</Table.Tr>
		);
	});

	function expandButtonManager(id: string) {
		setExpandedRound((prev) => (id !== prev ? id : ""));
	}

	return (
		<>
			<Title>{t("Ranking")}</Title>

			<Table
				stickyHeader
				tabularNums
				striped
				highlightOnHover
				withColumnBorders
			>
				<Table.Thead>
					<Table.Tr>
						<Table.Th>{t("Place")}</Table.Th>
						<Table.Th>{t("Contestant")}</Table.Th>
						<Table.Th>{t("Completed tasks")}</Table.Th>
						<Table.Th>{t("Sum")}</Table.Th>
						{data.rounds.map((round) => (
							<>
								<Table.Th
									key={round.id}
									onClick={() => expandButtonManager(round.id)}
								>
									{round.name}
								</Table.Th>
								{expandedRound === round.id &&
									round.problems.map((problem) => (
										<Table.Th key={problem.id}>{problem.name}</Table.Th>
									))}
							</>
						))}
					</Table.Tr>
				</Table.Thead>
				<Table.Tbody>{rows}</Table.Tbody>
			</Table>
		</>
	);
}
