import { Select, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Series } from "../../api/ParticipantApi";
import { offeredProblems, offers } from "./problemsOnOffer";

export interface ProblemChoiceProps {
    series: Series[];
    value: string | null;
    onChange: (slug: string | null) => void;
}

/**
 * Which problem this submission is for.
 *
 * One control, used by the submit screen and by the panel's modal, so the two
 * cannot come to disagree about what may be sent. They agreed already — a pause
 * closes a round, so `maySubmit` and a bare `isOpen` pick the same ones today —
 * and the screen said it the second way while the modal said it the Server's.
 * Stating it once is what keeps them agreeing if a pause ever stops closing a
 * round; `seriesState.maySubmit` makes the same argument about itself.
 */
export default function ProblemChoice({ series, value, onChange }: ProblemChoiceProps) {
    const { t } = useTranslation();
    const offered = offeredProblems(series);

    if (offered.length === 0) {
        return <Text c="dimmed">{t("No problems are open for submission right now")}</Text>;
    }

    return (
        <Select
            label={t("Problem")}
            placeholder={t("Choose the problem")}
            data={offered}
            value={offers(series, value) ? value : null}
            onChange={onChange}
            data-testid="problem-choice"
            searchable
            required
        />
    );
}
