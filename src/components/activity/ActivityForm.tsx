import { Alert, Card, Grid, Group, NumberInput, Select, Stack, Switch, Text, TextInput, Title } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { ActivityInput, JoinPolicy, LogVisibility, ScoreVisibility } from "../../api/ManagerApi";
import ZonedDateTimeInput from "../time/ZonedDateTimeInput";
import { MB } from "./activityInput";
import { activityTypes } from "../../renderers";

/**
 * Everything an activity is configured with, in one form.
 *
 * The three limits at the bottom are the ones the **Server** enforces, which is
 * why they are fields here rather than entries in the opaque configuration
 * chain: time and memory belong to the Runner and are set on the problem.
 */

/** The zones an installation in Poland actually uses. Free text stays allowed. */
const ZONES = ["Europe/Warsaw", "Europe/London", "UTC"];

export interface ActivityFormProps {
    value: ActivityInput;
    onChange: (value: ActivityInput) => void;
    /** Set once the activity exists: a slug in a URL cannot change under people. */
    slugLocked?: boolean;
    disabled?: boolean;
}

export default function ActivityForm({ value, onChange, slugLocked, disabled }: ActivityFormProps) {
    const { t } = useTranslation();
    const set = (patch: Partial<ActivityInput>) => onChange({ ...value, ...patch });
    const chosenType = activityTypes().find(type => type.id === value.type);

    return (
        <Stack gap="md">
            <Card withBorder radius="sm">
                <Title order={5} mb="sm">{t("Identity")}</Title>
                <Grid>
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                        <TextInput
                            label={t("Name")}
                            value={value.name}
                            onChange={e => set({ name: e.currentTarget.value })}
                            disabled={disabled}
                            required
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                        <TextInput
                            label={t("Slug")}
                            description={slugLocked
                                ? t("Immutable: participants' links point at it")
                                : t("Used in URLs, for example AMMPZ-2019")}
                            value={value.slug}
                            onChange={e => set({ slug: e.currentTarget.value })}
                            disabled={disabled || slugLocked}
                            required
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                        {/* A choice here too, and for the same reason as on the
                            create form: the type decides how the activity
                            presents its series. */}
                        <Select
                            label={t("Type")}
                            description={chosenType ? t(chosenType.description) : undefined}
                            data={activityTypes().map(type => ({
                                value: type.id,
                                label: `${t(type.label)} — ${type.id}`,
                            }))}
                            value={value.type}
                            onChange={type => type && set({ type })}
                            allowDeselect={false}
                            disabled={disabled}
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                        <Select
                            label={t("Ranking type")}
                            description={t("Chooses the ranking renderer. Independent of the type.")}
                            data={[
                                { value: "points", label: t("rankingType.points") },
                                { value: "icpc", label: t("rankingType.icpc") },
                            ]}
                            value={value.rankingType}
                            onChange={v => v && set({ rankingType: v })}
                            disabled={disabled}
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                        <Select
                            label={t("Time zone")}
                            description={t("Every time in this activity is shown in it")}
                            data={ZONES}
                            value={value.timeZone}
                            onChange={v => v && set({ timeZone: v })}
                            searchable
                            disabled={disabled}
                        />
                    </Grid.Col>
                </Grid>
            </Card>

            <Card withBorder radius="sm">
                <Title order={5} mb="sm">{t("Dates")}</Title>
                <Grid>
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                        <ZonedDateTimeInput
                            label={t("Starts")}
                            value={value.startDate}
                            timeZone={value.timeZone}
                            onChange={startDate => set({ startDate })}
                            disabled={disabled}
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                        <ZonedDateTimeInput
                            label={t("Ends")}
                            value={value.endDate}
                            timeZone={value.timeZone}
                            onChange={endDate => set({ endDate })}
                            disabled={disabled}
                        />
                    </Grid.Col>
                </Grid>
                <Text size="sm" c="dimmed" mt="xs">
                    {t("Leave both empty and the activity spans its series: the earliest start and the latest end.")}
                </Text>
            </Card>

            <Card withBorder radius="sm">
                <Title order={5} mb="sm">{t("Modules")}</Title>
                <Group gap="lg" wrap="wrap">
                    <Switch
                        label={t("Ranking")}
                        checked={value.modules.ranking}
                        onChange={e => set({ modules: { ...value.modules, ranking: e.currentTarget.checked } })}
                        disabled={disabled}
                    />
                    <Switch
                        label={t("Questions and announcements")}
                        checked={value.modules.questions}
                        onChange={e => set({ modules: { ...value.modules, questions: e.currentTarget.checked } })}
                        disabled={disabled}
                    />
                    <Switch
                        label={t("Rules")}
                        checked={value.modules.rules}
                        onChange={e => set({ modules: { ...value.modules, rules: e.currentTarget.checked } })}
                        disabled={disabled}
                    />
                </Group>
                <Text size="sm" c="dimmed" mt="xs">
                    {t("A disabled module leaves the participant's sidebar entirely.")}
                </Text>
            </Card>

            <Card withBorder radius="sm">
                <Title order={5} mb="sm">{t("Visibility and enrolment")}</Title>
                <Grid>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                        <Select
                            label={t("Who sees scores")}
                            data={[
                                { value: "everyone", label: t("scoreVisibility.everyone") },
                                { value: "participantOnly", label: t("scoreVisibility.participantOnly") },
                                { value: "managersOnly", label: t("scoreVisibility.managersOnly") },
                            ]}
                            value={value.scoreVisibility}
                            onChange={v => v && set({ scoreVisibility: v as ScoreVisibility })}
                            disabled={disabled}
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                        <Select
                            label={t("Who sees the evaluation log")}
                            description={t("Compiler output and the judge's messages")}
                            data={[
                                { value: "managersOnly", label: t("logVisibility.managersOnly") },
                                { value: "participant", label: t("logVisibility.participant") },
                            ]}
                            value={value.logVisibility}
                            onChange={v => v && set({ logVisibility: v as LogVisibility })}
                            disabled={disabled}
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                        <Select
                            label={t("Who may join")}
                            data={[
                                { value: "closed", label: t("joinPolicy.closed") },
                                { value: "invitation", label: t("joinPolicy.invitation") },
                                { value: "open", label: t("joinPolicy.open") },
                            ]}
                            value={value.joinPolicy}
                            onChange={v => v && set({ joinPolicy: v as JoinPolicy })}
                            disabled={disabled}
                        />
                    </Grid.Col>
                </Grid>
            </Card>

            <Card withBorder radius="sm">
                <Title order={5} mb="sm">{t("Limits the Server enforces")}</Title>
                <Grid>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                        <NumberInput
                            label={t("Maximum upload")}
                            description={t("Megabytes per submission")}
                            min={1}
                            max={128}
                            value={Math.round(value.maxUploadBytes / MB)}
                            onChange={v => set({ maxUploadBytes: (typeof v === "number" ? v : 8) * MB })}
                            disabled={disabled}
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                        <NumberInput
                            label={t("Files per submission")}
                            min={1}
                            max={20}
                            value={value.maxAttachments}
                            onChange={v => set({ maxAttachments: typeof v === "number" ? v : 1 })}
                            disabled={disabled}
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                        <NumberInput
                            label={t("Submissions per problem")}
                            description={t("Empty means unlimited")}
                            min={1}
                            value={value.maxSubmissionsPerProblem ?? ""}
                            onChange={v => set({ maxSubmissionsPerProblem: typeof v === "number" ? v : undefined })}
                            disabled={disabled}
                        />
                    </Grid.Col>
                </Grid>
                <Alert color="blue" icon={<IconInfoCircle size={18} />} mt="sm">
                    {t("Time and memory limits belong to the problem: they only become knowable while a solution runs.")}
                </Alert>
            </Card>
        </Stack>
    );
}
