import {
    ActionIcon, Alert, Badge, Button, Card, Code, Group, Modal, Stack, Switch, Table, Text,
    TextInput, Title, Tooltip,
} from "@mantine/core";
import { IconAlertTriangle, IconCopy, IconPlus, IconShieldLock, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Placement, Platform, PlatformInput, RosterEnrolment, RosterView, ToolRegistration,
} from "../../../api/LtiApi";
import LoadState from "../../../components/LoadState";
import { CopyButton } from "../../../components/buttons";
import { useApiCall, useApiEffect } from "../../../provider/apiContext";

/**
 * The platforms this installation accepts launches from.
 *
 * <b>Manual, by decision.</b> Dynamic Registration arrives later and does not
 * confer the one setting on this screen that matters — whether a platform may
 * say who somebody is. That stays a person's decision, made here.
 *
 * What this screen has to say out loud, because a form showing fields says none
 * of it:
 *
 * - <b>identity authority is the dangerous one.</b> A platform trusted with it
 *   can claim any account in the directory it names, so a compromised Moodle
 *   becomes a way into those accounts. It is off unless somebody turns it on.
 * - the issuer, client id and deployment id <b>cannot be changed afterwards</b>:
 *   they are the key every launch and every identity link hangs off.
 * - there is <b>no secret</b> anywhere in this, and its absence is not a gap —
 *   LTI authenticates a tool by a signature, and the tool's private key never
 *   leaves the Server.
 */
export default function LtiPlatformsPage() {
    const { t } = useTranslation();

    const call = useApiCall();

    const [platforms, setPlatforms] = useState<Platform[] | undefined>(undefined);
    const [placements, setPlacements] = useState<Placement[] | undefined>(undefined);
    const [accepting, setAccepting] = useState<Placement | undefined>(undefined);
    const [rosterOf, setRosterOf] = useState<Placement | undefined>(undefined);
    const [roster, setRoster] = useState<RosterView | undefined>(undefined);
    const [enrolled, setEnrolled] = useState<RosterEnrolment | undefined>(undefined);
    const [registration, setRegistration] = useState<ToolRegistration | undefined>(undefined);
    const [draft, setDraft] = useState<Draft | undefined>(undefined);
    const [removing, setRemoving] = useState<Platform | undefined>(undefined);
    const [saveError, setSaveError] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);

    const error = useApiEffect(async (api) => {
        setPlatforms(await api.ltiApi.listPlatforms());
        setPlacements(await api.ltiApi.listPlacements());
    }, [reload]);

    /** The same shape the providers screen uses: one place that catches and shows. */
    const run = async (operation: () => Promise<unknown>) => {
        setBusy(true);
        setSaveError(undefined);
        try {
            await operation();
            setReload(n => n + 1);
            return true;
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : String(e));
            return false;
        } finally {
            setBusy(false);
        }
    };

    const save = async () => {
        if (!draft) return;
        const input = toInput(draft);
        const done = await run(() => call(api => draft.id
            ? api.ltiApi.updatePlatform(draft.id!, input)
            : api.ltiApi.registerPlatform(input)));
        if (done) setDraft(undefined);
    };

    const remove = async () => {
        if (!removing) return;
        const done = await run(() => call(api => api.ltiApi.deletePlatform(removing.id)));
        if (done) setRemoving(undefined);
    };

    const showRegistration = (id: string) =>
        void run(async () => setRegistration(await call(api => api.ltiApi.getRegistration(id))));

    /**
     * Read on the way in, and only then. The platform is a university's Moodle,
     * and this screen is not entitled to poll it — decided 2026-08-15.
     */
    const showRoster = (placement: Placement) => {
        setRosterOf(placement);
        setRoster(undefined);
        setEnrolled(undefined);
        void run(async () => setRoster(await call(api => api.ltiApi.getRoster(placement.id))));
    };

    const enrolFromRoster = async () => {
        if (!rosterOf) return;
        const placement = rosterOf;
        await run(async () => {
            setEnrolled(await call(api => api.ltiApi.enrolFromRoster(placement.id)));
            // Re-read, because linking changes what the list says about people:
            // somebody unmatched a moment ago now has an account behind them.
            setRoster(await call(api => api.ltiApi.getRoster(placement.id)));
        });
    };

    return (
        <Stack gap="lg">
            <Group justify="space-between" align="flex-end">
                <div>
                    <Title order={2}>{t("LTI platforms")}</Title>
                    <Text c="dimmed" size="sm">
                        {t("Course platforms that may open AlgoJudge activities for their students.")}
                    </Text>
                </div>
                <Button leftSection={<IconPlus size={18} />} onClick={() => setDraft(empty())}>
                    {t("Register a platform")}
                </Button>
            </Group>

            <Alert variant="light" icon={<IconShieldLock size={18} />}>
                <Text size="sm">
                    {t("AlgoJudge implements the LTI 1.3 specification. It is not certified by 1EdTech.")}
                </Text>
            </Alert>

            <LoadState loading={platforms === undefined} error={error}>
                {platforms?.length === 0
                    ? <Text c="dimmed">{t("No platform is registered. Nothing can launch into this installation yet.")}</Text>
                    : (
                        <Table highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>{t("Platform")}</Table.Th>
                                    <Table.Th>{t("Issuer")}</Table.Th>
                                    <Table.Th>{t("Identity")}</Table.Th>
                                    <Table.Th />
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {platforms?.map(platform => (
                                    <Table.Tr key={platform.id}>
                                        <Table.Td>
                                            <Group gap="xs">
                                                <Text fw={500}>{platform.displayName}</Text>
                                                {!platform.enabled && (
                                                    <Badge color="gray" variant="light">{t("Disabled")}</Badge>
                                                )}
                                            </Group>
                                            <Text size="xs" c="dimmed">
                                                {t("Deployment")} {platform.deploymentId}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm">{platform.issuer}</Text>
                                            <Text size="xs" c="dimmed">{platform.clientId}</Text>
                                        </Table.Td>
                                        <Table.Td>
                                            {platform.isIdentityAuthority
                                                ? (
                                                    // Said in colour because it is the setting that
                                                    // decides whether a compromised platform can take
                                                    // an account.
                                                    <Badge color="orange" variant="light">
                                                        {t("May assert identity in")} {platform.identityNamespace}
                                                    </Badge>
                                                )
                                                : <Text size="sm" c="dimmed">{t("Cannot assert identity")}</Text>}
                                        </Table.Td>
                                        <Table.Td>
                                            <Group gap="xs" justify="flex-end" wrap="nowrap">
                                                <Button
                                                    size="xs"
                                                    variant="default"
                                                    onClick={() => showRegistration(platform.id)}
                                                >
                                                    {t("What to type into it")}
                                                </Button>
                                                <Button
                                                    size="xs"
                                                    variant="subtle"
                                                    onClick={() => setDraft(draftFrom(platform))}
                                                >
                                                    {t("Edit")}
                                                </Button>
                                                <Tooltip label={t("Remove")}>
                                                    <ActionIcon
                                                        variant="subtle"
                                                        color="red"
                                                        onClick={() => setRemoving(platform)}
                                                    >
                                                        <IconTrash size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    )}
            </LoadState>

            <div>
                <Title order={4} mb="xs">{t("Course placements")}</Title>
                <Text size="sm" c="dimmed" mb="sm">
                    {t("Where courses reach the activities of this installation. One activity may be placed in more than one course, and a launch waits until somebody accepts that.")}
                </Text>

                <LoadState loading={placements === undefined} error={error}>
                    {placements?.length === 0
                        ? <Text c="dimmed">{t("Nothing has been launched yet, so there is no placement to show.")}</Text>
                        : (
                            <Table highlightOnHover>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>{t("Course")}</Table.Th>
                                        <Table.Th>{t("Activity")}</Table.Th>
                                        <Table.Th>{t("Sharing")}</Table.Th>
                                        <Table.Th />
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {placements?.map(placement => (
                                        <Table.Tr key={placement.id}>
                                            <Table.Td>
                                                <Text fw={500}>{placement.contextTitle}</Text>
                                                <Text size="xs" c="dimmed">{placement.platformName}</Text>
                                            </Table.Td>
                                            <Table.Td>
                                                <Text size="sm">{placement.activityName}</Text>
                                                <Text size="xs" c="dimmed">{placement.activitySlug}</Text>
                                            </Table.Td>
                                            <Table.Td>
                                                {/*
                                                  * Silent about the ordinary case on purpose: an
                                                  * activity reached from one course is not a
                                                  * question, and a badge on every row would make
                                                  * the one row that is a question look like all
                                                  * the others.
                                                  */}
                                                {!placement.shared
                                                    ? <Text size="sm" c="dimmed">{t("This course only")}</Text>
                                                    : placement.sharingAcknowledged
                                                        ? <Badge color="gray" variant="light">{t("Shared, accepted")}</Badge>
                                                        : <Badge color="orange" variant="light">{t("Waiting for a decision")}</Badge>}
                                            </Table.Td>
                                            <Table.Td>
                                                <Group gap="xs" justify="flex-end" wrap="nowrap">
                                                    <Button
                                                        size="xs"
                                                        variant="subtle"
                                                        onClick={() => showRoster(placement)}
                                                    >
                                                        {t("Who is in the course")}
                                                    </Button>
                                                    {placement.shared && !placement.sharingAcknowledged && (
                                                        <Button
                                                            size="xs"
                                                            variant="default"
                                                            loading={busy}
                                                            onClick={() => setAccepting(placement)}
                                                        >
                                                            {t("Accept the sharing")}
                                                        </Button>
                                                    )}
                                                </Group>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        )}
                </LoadState>
            </div>

            <Modal
                opened={accepting !== undefined}
                onClose={() => setAccepting(undefined)}
                title={t("Accept that this activity is shared?")}
            >
                <Stack gap="sm">
                    <Text size="sm">
                        {t("This activity is already reached from another course. Accepting means it feeds both gradebooks, and every launch from here works from now on.")}
                    </Text>
                    <Text size="sm" c="dimmed">
                        {t("It cannot be withdrawn here: scores already sent stay where they were sent. Remove the placement in the course instead.")}
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setAccepting(undefined)}>
                            {t("Cancel")}
                        </Button>
                        <Button
                            loading={busy}
                            onClick={async () => {
                                const id = accepting?.id;
                                if (!id) return;
                                if (await run(() => call(api => api.ltiApi.acknowledgeSharing(id)))) {
                                    setAccepting(undefined);
                                }
                            }}
                        >
                            {t("Accept the sharing")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            <Modal
                opened={rosterOf !== undefined}
                onClose={() => setRosterOf(undefined)}
                title={t("Who is in the course")}
                size="xl"
            >
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                        {t("Read from the platform just now. Nothing here refreshes on its own.")}
                    </Text>

                    <LoadState loading={roster === undefined} error={undefined}>
                        {roster && (
                            <>
                                <Group gap="xs">
                                    <Badge variant="light">
                                        {roster.total} {t("in the course")}
                                    </Badge>
                                    <Badge variant="light" color="gray">
                                        {roster.known} {t("with an account here")}
                                    </Badge>
                                    {/*
                                      * What the platform was willing to say. Shown
                                      * because a roster that carries no usernames
                                      * cannot link anybody, and the reason for
                                      * that is the platform's configuration —
                                      * not something this screen can fix or
                                      * should hide.
                                      */}
                                    <Badge
                                        variant="light"
                                        color={roster.disclosed.withUsername === 0 ? "orange" : "gray"}
                                    >
                                        {roster.disclosed.withUsername} {t("with a username")}
                                    </Badge>
                                </Group>

                                {roster.disclosed.withUsername === 0 && (
                                    <Alert color="orange" variant="light" icon={<IconAlertTriangle size={18} />}>
                                        <Text size="sm">
                                            {t("This platform sends no usernames, so nobody here can be matched to an account. An address is never used for that.")}
                                        </Text>
                                    </Alert>
                                )}

                                <Table highlightOnHover>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>{t("Person")}</Table.Th>
                                            <Table.Th>{t("Role")}</Table.Th>
                                            <Table.Th>{t("Account here")}</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {roster.members.map(member => (
                                            <Table.Tr key={member.subject}>
                                                <Table.Td>
                                                    <Text size="sm">{member.name ?? member.subject}</Text>
                                                    <Text size="xs" c="dimmed">
                                                        {member.assertedUsername ?? t("no username sent")}
                                                        {member.status && member.status !== "Active"
                                                            ? ` · ${t("has left the course")}`
                                                            : ""}
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="sm">{member.roles.join(", ")}</Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    {member.userName
                                                        ? (
                                                            <Group gap="xs">
                                                                <Text size="sm">{member.userName}</Text>
                                                                <Badge
                                                                    size="sm"
                                                                    variant="light"
                                                                    color={member.strength === "confirmed" ? "gray" : "blue"}
                                                                >
                                                                    {member.strength === "confirmed"
                                                                        ? t("confirmed")
                                                                        : t("provisional")}
                                                                </Badge>
                                                            </Group>
                                                        )
                                                        : <Text size="sm" c="dimmed">{t("nobody matched")}</Text>}
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </>
                        )}
                    </LoadState>

                    {enrolled && (
                        <Alert variant="light">
                            <Text size="sm">
                                {t("Linked")}: {enrolled.linked} · {t("Put into the activity")}: {enrolled.granted}
                            </Text>
                            {enrolled.skipped.length > 0 && (
                                <Stack gap={2} mt="xs">
                                    <Text size="sm">{t("Left out, and why:")}</Text>
                                    {enrolled.skipped.map(skip => (
                                        <Text key={skip.subject} size="xs" c="dimmed">
                                            {skip.name ?? skip.subject} — {reasonText(skip.reason, t)}
                                        </Text>
                                    ))}
                                </Stack>
                            )}
                        </Alert>
                    )}

                    <Text size="xs" c="dimmed">
                        {t("Somebody put in this way is marked provisional until they open the activity themselves.")}
                    </Text>

                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setRosterOf(undefined)}>
                            {t("Close")}
                        </Button>
                        <Button loading={busy} onClick={() => void enrolFromRoster()}>
                            {t("Put them in the activity")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            <Modal
                opened={registration !== undefined}
                onClose={() => setRegistration(undefined)}
                title={t("What to type into the platform")}
                size="lg"
            >
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                        {t("The same for every platform. Paste them into the external tool's configuration.")}
                    </Text>
                    {registration && ([
                        [t("Tool URL"), registration.toolUrl],
                        [t("Login URL"), registration.loginUrl],
                        [t("Redirect URI"), registration.redirectUri],
                        [t("Public key set URL"), registration.keySetUrl],
                    ] as const).map(([label, value]) => (
                        <Group key={label} justify="space-between" wrap="nowrap" gap="xs">
                            <div style={{ minWidth: 0 }}>
                                <Text size="xs" c="dimmed">{label}</Text>
                                <Code>{value}</Code>
                            </div>
                            <CopyButton value={value} size="compact-xs" variant="subtle">
                                {() => (
                                    <Group gap={4} wrap="nowrap">
                                        <IconCopy size={13} />
                                        {t("Copy")}
                                    </Group>
                                )}
                            </CopyButton>
                        </Group>
                    ))}

                    <Alert variant="light" color="yellow" icon={<IconAlertTriangle size={18} />}>
                        <Text size="sm" mb="xs">
                            {t("Without these custom parameters a launch cannot tell who arrived, and lands on a sign-in page instead of the activity.")}
                        </Text>
                        {registration?.customParameters.map(parameter => (
                            <Code key={parameter} block>{parameter}</Code>
                        ))}
                        <Text size="xs" c="dimmed" mt="xs">
                            {t("And on each placement, one more naming the activity: activity=<its slug>.")}
                        </Text>
                    </Alert>
                </Stack>
            </Modal>

            <Modal
                opened={draft !== undefined}
                onClose={() => setDraft(undefined)}
                title={draft?.id ? t("Edit the platform") : t("Register a platform")}
                size="lg"
            >
                {draft && (
                    <Stack gap="sm">
                        <TextInput
                            label={t("Name")}
                            value={draft.displayName}
                            onChange={e => setDraft({ ...draft, displayName: e.currentTarget.value })}
                        />
                        <TextInput
                            label={t("Issuer")}
                            description={draft.id ? t("Cannot be changed: every launch and every identity link hangs off it.") : undefined}
                            disabled={Boolean(draft.id)}
                            value={draft.issuer}
                            onChange={e => setDraft({ ...draft, issuer: e.currentTarget.value })}
                        />
                        <Group grow>
                            <TextInput
                                label={t("Client id")}
                                disabled={Boolean(draft.id)}
                                value={draft.clientId}
                                onChange={e => setDraft({ ...draft, clientId: e.currentTarget.value })}
                            />
                            <TextInput
                                label={t("Deployment id")}
                                disabled={Boolean(draft.id)}
                                value={draft.deploymentId}
                                onChange={e => setDraft({ ...draft, deploymentId: e.currentTarget.value })}
                            />
                        </Group>
                        <TextInput
                            label={t("Public key set URL")}
                            value={draft.keySetUrl}
                            onChange={e => setDraft({ ...draft, keySetUrl: e.currentTarget.value })}
                        />
                        <TextInput
                            label={t("Access token URL")}
                            value={draft.authTokenUrl}
                            onChange={e => setDraft({ ...draft, authTokenUrl: e.currentTarget.value })}
                        />
                        <TextInput
                            label={t("Authorization URL")}
                            value={draft.authLoginUrl}
                            onChange={e => setDraft({ ...draft, authLoginUrl: e.currentTarget.value })}
                        />

                        <Card withBorder padding="sm" bg="var(--mantine-color-orange-light)">
                            <Switch
                                label={t("This platform may say who somebody is")}
                                checked={draft.isIdentityAuthority}
                                onChange={e => setDraft({
                                    ...draft, isIdentityAuthority: e.currentTarget.checked,
                                })}
                            />
                            <Text size="xs" mt="xs">
                                {t("With this on, a launch connects itself to the AlgoJudge account whose username the platform sends. A platform that is compromised can then reach those accounts. Leave it off unless the same people administer both.")}
                            </Text>
                            {draft.isIdentityAuthority && (
                                <TextInput
                                    mt="sm"
                                    label={t("Only for accounts from this identity provider")}
                                    description={t("Its slug. Accounts that did not come through it — local ones, and administrators — cannot be claimed.")}
                                    value={draft.identityNamespace}
                                    onChange={e => setDraft({
                                        ...draft, identityNamespace: e.currentTarget.value,
                                    })}
                                />
                            )}
                        </Card>

                        <Switch
                            label={t("Accept launches")}
                            checked={draft.enabled}
                            onChange={e => setDraft({ ...draft, enabled: e.currentTarget.checked })}
                        />

                        {saveError !== undefined && (
                            <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />}>
                                {saveError}
                            </Alert>
                        )}

                        <Group justify="flex-end">
                            <Button variant="default" onClick={() => setDraft(undefined)}>
                                {t("Cancel")}
                            </Button>
                            <Button loading={busy} onClick={() => void save()}>
                                {draft.id ? t("Save") : t("Register")}
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>

            <Modal
                opened={removing !== undefined}
                onClose={() => setRemoving(undefined)}
                title={t("Remove this platform?")}
            >
                <Stack gap="sm">
                    <Text size="sm">
                        {t("Refused while any course still has an activity from it. Switching it off is the reversible act.")}
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setRemoving(undefined)}>
                            {t("Cancel")}
                        </Button>
                        <Button color="red" loading={busy} onClick={() => void remove()}>
                            {t("Remove")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}

interface Draft extends PlatformInput {
    id?: string;
    identityNamespace: string;
}

const empty = (): Draft => ({
    displayName: "",
    issuer: "",
    clientId: "",
    deploymentId: "",
    keySetUrl: "",
    authTokenUrl: "",
    authLoginUrl: "",
    isIdentityAuthority: false,
    identityNamespace: "",
    enabled: true,
});

const draftFrom = (platform: Platform): Draft => ({
    id: platform.id,
    displayName: platform.displayName,
    issuer: platform.issuer,
    clientId: platform.clientId,
    deploymentId: platform.deploymentId,
    keySetUrl: platform.keySetUrl,
    authTokenUrl: platform.authTokenUrl,
    authLoginUrl: platform.authLoginUrl,
    isIdentityAuthority: platform.isIdentityAuthority,
    identityNamespace: platform.identityNamespace ?? "",
    usernameClaim: platform.usernameClaim,
    enabled: platform.enabled,
});

const toInput = (draft: Draft): PlatformInput => ({
    displayName: draft.displayName,
    issuer: draft.issuer,
    clientId: draft.clientId,
    deploymentId: draft.deploymentId,
    keySetUrl: draft.keySetUrl,
    authTokenUrl: draft.authTokenUrl,
    authLoginUrl: draft.authLoginUrl,
    isIdentityAuthority: draft.isIdentityAuthority,
    // Empty is absent, never an empty string: the Server reads "no namespace"
    // from its absence and refuses the dangerous combination on it.
    identityNamespace: draft.identityNamespace.trim() || undefined,
    usernameClaim: draft.usernameClaim,
    enabled: draft.enabled,
});

/**
 * Why somebody was left out, in words rather than in a code.
 *
 * Each of these is a different thing for a teacher to do about it, which is why
 * the Server sends four reasons instead of one "skipped".
 */
function reasonText(reason: string, t: (key: string) => string): string {
    switch (reason) {
        case "noUsername":
            return t("the platform sent no username for them");
        case "unknownAccount":
            return t("nobody here uses that username");
        case "outsideNamespace":
            return t("somebody uses it, but they did not come in through this directory");
        case "inactive":
            return t("the course says they have left");
        default:
            return reason;
    }
}
