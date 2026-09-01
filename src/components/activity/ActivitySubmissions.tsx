import { ActionIcon, Badge, Button, Group, Paper, ScrollArea, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconBox, IconSend } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMatch, useNavigate } from "react-router-dom";
import { Activity, Series, SubmissionSummary } from "../../api/ParticipantApi";
import StateBadge from "../submission/StateBadge";
import ActivityTime from "../time/ActivityTime";
import { formatInZone } from "../time/format";
import { useApiEffect } from "../../provider/apiContext";
import SubmitModal from "./SubmitModal";
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

/**
 * Whether an instant falls on today **in the activity's zone**, which is the
 * zone the row is drawn in.
 *
 * It compared the reader's own today, and the two disagree for as long as the
 * zones straddle midnight. Found by `verify-boards` on a CI runner in UTC: a
 * submission a minute old was drawn `30.08.2026 01:56` rather than `01:56`,
 * because it was still 29 August where the comparison was made and already the
 * 30th where the text was rendered. A participant in Warsaw sees that every
 * night between their midnight and UTC's.
 */
const isToday = (value: string, timeZone: string): boolean =>
    formatInZone(value, timeZone, "date")
    === formatInZone(new Date().toISOString(), timeZone, "date");

export interface ActivitySubmissionsProps {
    /** Absent outside an activity, where there is nothing to show. */
    activity?: Activity;
    /** The rounds, for the problem picker in the modal. Already held by the shell. */
    series?: Series[];
}

export default function ActivitySubmissions({ activity, series }: ActivitySubmissionsProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    // Which problem the reader is on, where they are on one, so sending from a
    // statement opens on that problem rather than on an empty picker.
    //
    // Matched rather than read from `useParams`: the panel is mounted by the
    // shell, outside the `Outlet`, so its params are the layout route's and hold
    // no problem however deep the child route goes.
    const onProblem = useMatch("/activities/:activityId/problems/:problemId");
    const onSubmit = useMatch("/activities/:activityId/submit/:problemId");
    const problemId = onProblem?.params.problemId ?? onSubmit?.params.problemId;
    // **Guarded, because this is not one screen.** The shell mounts the panel
    // outside the `Outlet`, so a throw here is thrown while rendering the layout
    // and takes the header, the navbar and every route with it — and storage
    // does not return nothing where it is blocked, it throws. Collapsed is the
    // default anyway.
    const [open, setOpen] = useState(() => {
        try {
            return sessionStorage.getItem(OPEN_KEY) === "true";
        } catch {
            return false;
        }
    });
    const [sending, setSending] = useState(false);
    const [items, setItems] = useState<SubmissionSummary[]>([]);

    const activityId = activity?.id;
    const slug = activity?.slug;
    const timeZone = activity?.timeZone;

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

    if (!activity || !activityId || !slug) return null;

    const toggle = () => {
        const next = !open;
        setOpen(next);
        try {
            sessionStorage.setItem(OPEN_KEY, String(next));
        } catch {
            // Storage refused. The panel still opens; it stops remembering
            // across a reload, which is visibly odd rather than broken.
        }
    };

    return (
        // Not on a phone; the width it is hidden at lives beside the width it is
        // drawn at, in `ActivitySubmissions.module.css`.
        <Paper withBorder shadow="md" radius="md" className={classes.panel} data-testid="submissions-panel">
            {/* Two controls side by side, not one inside the other. The bar used
                to be a single button wrapping everything, and a button inside a
                button is invalid — the trap that cost the series pause control
                its keyboard access before it was moved out of its own row. */}
            <div className={classes.bar}>
                <UnstyledButton onClick={toggle} className={classes.toggle} aria-expanded={open}>
                    <Group gap="xs" wrap="nowrap">
                        <IconBox size={16} />
                        <Text size="sm" fw={500}>{t("My submissions")}</Text>
                        <Text size="sm" c="dimmed">{items.length}</Text>
                    </Group>
                </UnstyledButton>
                <Button
                    size="compact-xs"
                    variant="light"
                    leftSection={<IconSend size={14} />}
                    onClick={() => setSending(true)}
                >
                    {t("Send")}
                </Button>
                <UnstyledButton onClick={toggle} tabIndex={-1} aria-hidden className={classes.chevron}>
                    <ActionIcon component="div" variant="subtle" size="sm" aria-hidden>
                        {open ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
                    </ActionIcon>
                </UnstyledButton>
            </div>

            <SubmitModal
                activity={activity}
                series={series ?? []}
                opened={sending}
                onClose={() => setSending(false)}
                initialSlug={problemId}
            />

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
                                data-testid="submission-row"
                                onClick={() => navigate(`/activities/${slug}/submissions/${submission.id}`)}
                            >
                                {/* One line. The name is the only part that may
                                    be cut, because it is the only part somebody
                                    can already infer from the slug beside it. */}
                                <Group wrap="nowrap" gap={6}>
                                    {/* The hour alone for today, the date as well
                                        for anything older: an activity runs over
                                        several rounds on several days, and
                                        `03:36` above `02:34` reads as out of
                                        order until it says which day it is. */}
                                    <Text size="xs" c="dimmed" ff="monospace" style={{ flexShrink: 0 }}>
                                        <ActivityTime
                                            value={submission.submittedAt}
                                            timeZone={timeZone ?? "Europe/Warsaw"}
                                            format={isToday(submission.submittedAt, timeZone ?? "Europe/Warsaw") ? "time" : "datetime"}
                                            hideZone
                                        />
                                    </Text>
                                    {/* The slug leads: it is what somebody
                                        scanning for their own submission looks
                                        at, and the name is what tells them which
                                        problem it was. */}
                                    <Text size="sm" fw={500} style={{ flexShrink: 0 }}>
                                        [{submission.problemSlug}]
                                    </Text>
                                    <Text size="sm" lineClamp={1} c="dimmed" style={{ minWidth: 0 }}>
                                        {submission.problemName}
                                    </Text>
                                    <Group wrap="nowrap" gap={6} ml="auto" style={{ flexShrink: 0 }}>
                                        {/* Beside the verdict rather than inside
                                            it: `12/100` and `Wrong answer` are
                                            two facts, and the badge carries one. */}
                                        {submission.score !== undefined && (
                                            <Text size="xs" c="dimmed" ff="monospace">
                                                {submission.score} / {submission.maxScore ?? "?"}
                                            </Text>
                                        )}
                                        {submission.excluded && (
                                            <Tooltip label={t("Not counted in the ranking")}>
                                                <Badge variant="light" color="orange" size="sm">
                                                    {t("Not counted")}
                                                </Badge>
                                            </Tooltip>
                                        )}
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
