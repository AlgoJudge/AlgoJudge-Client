import {
    Alert, Button, Card, Center, Checkbox, Group, Loader, Radio, Stack, Text, Title,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { DeepLinkChoosing } from "../../api/LtiApi";
import { useApiCall } from "../../provider/apiContext";

/**
 * What to place in a course, chosen by the person the platform sent here.
 *
 * <b>The answer leaves by form, not by fetch.</b> The platform expects a POST
 * from this person's own browser, carrying the platform's cookie, at an address
 * that checks a session key it issued — a request made from script would arrive
 * without any of that and be refused, or worse, be accepted at a screen the
 * person never sees.
 *
 * The form targets `_top` for the same reason: the choosing usually happens
 * inside the platform's own iframe, and the result belongs in the window the
 * platform is driving, not in the frame it opened us in.
 */
export default function ChoosePage() {
    const { t } = useTranslation();
    const call = useApiCall();
    const [params] = useSearchParams();
    const code = params.get("code") ?? "";

    const [choosing, setChoosing] = useState<DeepLinkChoosing | null>(null);
    const [picked, setPicked] = useState<string[]>([]);
    const [failed, setFailed] = useState<string | null>(null);
    const [sending, setSending] = useState(false);

    // Filled in when the answer is ready; the form below submits itself once it
    // has an address and a token.
    const [answer, setAnswer] = useState<{ returnUrl: string; jwt: string } | null>(null);
    const form = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (!code) {
            setFailed(t("This address is incomplete. It should have been opened by a platform asking what to place."));
            return;
        }

        call(api => api.ltiApi.openChoosing(code))
            .then(setChoosing)
            .catch(() => setFailed(t("That choosing is finished or expired. Start it again from the platform.")));
    }, [call, code, t]);

    useEffect(() => {
        if (answer) form.current?.submit();
    }, [answer]);

    const send = async () => {
        setSending(true);
        setFailed(null);
        try {
            setAnswer(await call(api => api.ltiApi.answerChoosing(code, picked)));
        } catch (error) {
            setFailed(error instanceof Error ? error.message : t("The platform would not take that"));
            setSending(false);
        }
    };

    if (failed && !choosing) {
        return (
            <Alert color="red" icon={<IconAlertTriangle />} title={t("This cannot be answered")}>
                {failed}
            </Alert>
        );
    }

    if (!choosing) {
        return <Center my="xl"><Loader /></Center>;
    }

    const single = !choosing.acceptMultiple;

    return (
        <Stack gap="md">
            <div>
                <Title order={3}>{t("Choose what to place")}</Title>
                <Text c="dimmed" size="sm">
                    {t("Into {{course}}", { course: choosing.contextTitle })}
                </Text>
            </div>

            {choosing.activities.length === 0 && (
                <Alert color="yellow" icon={<IconAlertTriangle />}>
                    {t("You do not manage any activity yet, so there is nothing to place here.")}
                </Alert>
            )}

            {/*
              * One control or several, decided by what the platform said it
              * would take. Offering checkboxes to a platform that keeps only the
              * first item is offering a choice it will silently ignore.
              */}
            {single ? (
                <Radio.Group value={picked[0] ?? ""} onChange={value => setPicked([value])}>
                    <Stack gap="xs">
                        {choosing.activities.map(activity => (
                            <Card key={activity.id} withBorder padding="sm">
                                <Radio
                                    value={activity.id}
                                    label={activity.name}
                                    description={activity.slug}
                                />
                            </Card>
                        ))}
                    </Stack>
                </Radio.Group>
            ) : (
                <Checkbox.Group value={picked} onChange={setPicked}>
                    <Stack gap="xs">
                        {choosing.activities.map(activity => (
                            <Card key={activity.id} withBorder padding="sm">
                                <Checkbox
                                    value={activity.id}
                                    label={activity.name}
                                    description={activity.slug}
                                />
                            </Card>
                        ))}
                    </Stack>
                </Checkbox.Group>
            )}

            {failed && (
                <Alert color="red" icon={<IconAlertTriangle />}>{failed}</Alert>
            )}

            <Group justify="flex-end">
                {/* Its own key, not `Place`. That one is the ranking's place
                    column — a noun — and borrowing it for this verb renamed
                    "Miejsce" to "Umieść" on every board in the product. */}
                <Button onClick={send} disabled={picked.length === 0 || sending} loading={sending}>
                    {t("Place in the course")}
                </Button>
            </Group>

            {answer && (
                <form ref={form} method="POST" action={answer.returnUrl} target="_top">
                    <input type="hidden" name="JWT" value={answer.jwt} />
                </form>
            )}
        </Stack>
    );
}
