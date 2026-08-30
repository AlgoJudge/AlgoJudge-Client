import { Button, Card, Group, NumberInput, Select, Text } from "@mantine/core";
import { IconClockPlay } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ManagedSeries } from "../../../../api/ManagerApi";
import { formatInZone } from "../../../../components/time/format";

/**
 * Moving a round, in minutes.
 *
 * A round that starts late — a projector that would not work, a network that
 * came back at 10:07 — used to be moved by opening the series editor and
 * retyping two timestamps, under pressure, from a screen showing the old ones.
 * This says what is about to happen before it happens.
 *
 * The **delta** is sent, never the two computed instants: two managers each
 * moving a delayed round by ten minutes from the same screen would otherwise
 * both write +10 and one shift would be lost.
 */
export interface ShiftSeriesProps {
    series: ManagedSeries[];
    timeZone: string;
    disabled?: boolean;
    busy?: boolean;
    onShift: (seriesId: string, minutes: number) => void;
}

const shifted = (at: string | undefined, minutes: number): string | undefined =>
    at === undefined ? undefined : new Date(Date.parse(at) + minutes * 60_000).toISOString();

export default function ShiftSeries({ series, timeZone, disabled, busy, onShift }: ShiftSeriesProps) {
    const { t } = useTranslation();
    const [seriesId, setSeriesId] = useState<string>(series[0]?.id ?? "");
    const [minutes, setMinutes] = useState<number>(10);

    const chosen = series.find(s => s.id === seriesId) ?? series[0];
    if (!chosen) return null;

    const span = (start?: string, end?: string) => {
        // A series with no dates has nothing to move, and says so rather than
        // rendering a dash pretending to be a time.
        if (!start && !end) return t("no times");
        const from = start ? formatInZone(start, timeZone, "time") : "—";
        const to = end ? formatInZone(end, timeZone, "time") : "—";
        return `${from}–${to}`;
    };

    const timed = chosen.startDate !== undefined || chosen.endDate !== undefined;
    const step = Number.isFinite(minutes) ? minutes : 0;

    return (
        <Card withBorder radius="sm">
            <Group gap="sm" wrap="wrap" align="flex-end">
                <Text size="sm" mb={7}>{t("Move the series")}</Text>
                <Select
                    data={series.map(s => ({ value: s.id, label: s.name }))}
                    value={chosen.id}
                    onChange={value => value && setSeriesId(value)}
                    allowDeselect={false}
                    disabled={disabled}
                    w={200}
                />
                <Text size="sm" mb={7}>{t("by")}</Text>
                <NumberInput
                    value={minutes}
                    onChange={value => setMinutes(typeof value === "number" ? value : 0)}
                    step={5}
                    disabled={disabled}
                    w={110}
                    // Negative moves it earlier, which is an ordinary thing to
                    // want when a round was announced too late.
                    allowNegative
                />
                <Text size="sm" mb={7}>{t("minutes")}</Text>

                {timed ? (
                    <Text size="sm" mb={7} c="dimmed">
                        — {t("from")} <Text span ff="monospace">{span(chosen.startDate, chosen.endDate)}</Text>
                        {" "}{t("to")}{" "}
                        <Text span ff="monospace" fw={600} c={step === 0 ? "dimmed" : undefined}>
                            {span(shifted(chosen.startDate, step), shifted(chosen.endDate, step))}
                        </Text>
                    </Text>
                ) : (
                    <Text size="sm" mb={7} c="dimmed">— {t("this series has no times to move")}</Text>
                )}

                <Button data-testid="move"
                    leftSection={<IconClockPlay size={16} />}
                    loading={busy}
                    disabled={disabled || !timed || step === 0}
                    onClick={() => onShift(chosen.id, step)}
                >
                    {t("Move")}
                </Button>
            </Group>
            <Text size="xs" c="dimmed" mt="xs">
                {t("The ranking freeze and reveal move with it.")}
            </Text>
        </Card>
    );
}
