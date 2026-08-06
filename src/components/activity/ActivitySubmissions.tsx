import { ActionIcon, Group, Paper, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconBox } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { SubmissionSummary } from "../../api/ParticipantApi";
import StateBadge from "../submission/StateBadge";
import ActivityTime from "../time/ActivityTime";
import { useApiEffect } from "../../provider/apiContext";
import classes from "./ActivitySubmissions.module.css";

/**
 * The reader's own submissions in the activity they are in, in the corner.
 *
 * Watching a verdict arrive used to mean leaving whatever you were reading for
 * the submissions screen and coming back. This keeps the last few in view
 * wherever somebody is — a statement, the ranking, the questions — and gets out
 * of the way when it is not wanted.
 *
 * **Collapsed by default.** It is a thing to glance at, not a thing to work in,
 * and something permanently covering a corner of a statement would be worse than
 * the trip it saves. The choice is remembered for the session.
 */

const HOW_MANY = 12;
const OPEN_KEY = "algojudge.submissions.open";

export interface ActivitySubmissionsProps {
    /** Absent outside an activity, where there is nothing to show. */
    activityId?: string;
    slug?: string;
    timeZone?: string;
}

export default function ActivitySubmissions({ activityId, slug, timeZone }: ActivitySubmissionsProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [open, setOpen] = useState(() => sessionStorage.getItem(OPEN_KEY) === "true");
    const [items, setItems] = useState<SubmissionSummary[]>([]);

    useApiEffect(async (api) => {
        if (!activityId) return;
        const load = async () => {
            const page = await api.participantApi.getSubmissions(activityId, { pageSize: HOW_MANY });
            setItems(page.items);
        };
        await load();
        // The same event the notification listens to. Refetched rather than
        // patched: the Server decides the order and what a row says, and a list
        // of a dozen costs nothing to ask for again.
        api.participantApi.eventDispatcher.addEventListener("submissionStateChanged", evt => {
            if (evt.data.activityId !== activityId) return;
            void load();
        });
    }, [activityId]);

    if (!activityId || !slug) return null;

    const toggle = () => {
        setOpen(current => {
            sessionStorage.setItem(OPEN_KEY, String(!current));
            return !current;
        });
    };

    return (
        <Paper withBorder shadow="md" radius="md" className={classes.panel}>
            <UnstyledButton onClick={toggle} className={classes.bar} aria-expanded={open}>
                <Group gap="xs" wrap="nowrap">
                    <IconBox size={16} />
                    <Text size="sm" fw={500}>{t("My submissions")}</Text>
                    <Text size="sm" c="dimmed">{items.length}</Text>
                </Group>
                <ActionIcon component="div" variant="subtle" size="sm" aria-hidden>
                    {open ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
                </ActionIcon>
            </UnstyledButton>

            {open && (
                <ScrollArea.Autosize mah={320} type="auto">
                    <Stack gap={0} p={4}>
                        {items.length === 0 && (
                            <Text size="sm" c="dimmed" p="sm">{t("Nothing sent yet")}</Text>
                        )}
                        {/* Newest first, as the Server sends them. */}
                        {items.map(submission => (
                            <UnstyledButton
                                key={submission.id}
                                className={classes.row}
                                onClick={() => navigate(`/activities/${slug}/submissions/${submission.id}`)}
                            >
                                <Group justify="space-between" wrap="nowrap" gap="xs">
                                    <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                                        <Text size="xs" c="dimmed" ff="monospace">
                                            <ActivityTime
                                                value={submission.submittedAt}
                                                timeZone={timeZone ?? "Europe/Warsaw"}
                                                format="time"
                                                hideZone
                                            />
                                        </Text>
                                        <Text size="sm" lineClamp={1}>[{submission.problemSlug}]</Text>
                                    </Group>
                                    <Group gap={6} wrap="nowrap">
                                        <StateBadge
                                            state={submission.state}
                                            verdict={submission.verdict}
                                            score={submission.score}
                                            maxScore={submission.maxScore}
                                        />
                                    </Group>
                                </Group>
                            </UnstyledButton>
                        ))}
                    </Stack>
                </ScrollArea.Autosize>
            )}
        </Paper>
    );
}
