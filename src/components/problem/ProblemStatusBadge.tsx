import { Badge, Group, Text } from "@mantine/core";
import { IconCircle, IconCircleCheck, IconCircleDashed, IconCircleHalf2 } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { ProblemStatus } from "../../api/ParticipantApi";

const STATUS = {
    solved: { icon: IconCircleCheck, color: "teal" },
    partial: { icon: IconCircleHalf2, color: "yellow" },
    attempted: { icon: IconCircleDashed, color: "red" },
    untouched: { icon: IconCircle, color: "gray" },
} as const;

export interface ProblemStatusBadgeProps {
    status: ProblemStatus;
    bestScore?: number;
    maxScore?: number;
    attempts: number;
}

/**
 * The participant's own standing on a problem.
 *
 * Shared by the problem list and the statement, because the statement is where
 * someone sits while waiting for a verdict — a status that only moved on the
 * list they came from would be the one place it is not seen.
 */
export default function ProblemStatusBadge({ status, bestScore, maxScore, attempts }: ProblemStatusBadgeProps) {
    const { t } = useTranslation();
    const { icon: Icon, color } = STATUS[status];
    return (
        <Group gap="xs" wrap="nowrap">
            {bestScore !== undefined && (
                <Text size="sm" c="dimmed">{bestScore} / {maxScore ?? "?"}</Text>
            )}
            {attempts > 0 && (
                <Text size="sm" c="dimmed">{t("Attempts")}: {attempts}</Text>
            )}
            <Badge color={color} variant="light" leftSection={<Icon size={14} />}>
                {t(status)}
            </Badge>
        </Group>
    );
}
