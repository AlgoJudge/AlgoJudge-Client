import { Badge } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { JobState } from "../../api/ParticipantApi";

export interface StateBadgeProps {
    state: JobState;
    verdict?: string;
    score?: number;
    maxScore?: number;
}

/**
 * The state of an evaluation, as one badge.
 *
 * While a submission is still being judged the state is the only thing worth
 * saying; once it is done the verdict is what the participant came for, so the
 * badge switches from one to the other rather than showing both.
 *
 * Colour comes from the **score**, never from the verdict text. A verdict is a
 * type-specific string the Client is not entitled to interpret — matching on
 * "Accepted" would work for `standard-io` and quietly mislead for anything
 * else — whereas the score against its maximum means the same thing for every
 * problem type.
 */
const colorFor = ({ state, score, maxScore }: StateBadgeProps): string => {
    switch (state) {
        case "running": return "blue";
        case "failed": return "red";
        case "queued":
        case "cancelled": return "gray";
        case "completed":
            if (score === undefined || maxScore === undefined || maxScore === 0) return "teal";
            if (score >= maxScore) return "teal";
            return score > 0 ? "yellow" : "red";
    }
};

export default function StateBadge(props: StateBadgeProps) {
    const { t } = useTranslation();
    const label = props.state === "completed" && props.verdict ? props.verdict : t(props.state);
    return (
        <Badge color={colorFor(props)} variant={props.state === "running" ? "filled" : "light"}>
            {label}
        </Badge>
    );
}
