import { Stack, Text } from "@mantine/core";

/**
 * A board row's name, and what a group carries beside it.
 *
 * **One component for both boards**, because a group has to read the same way
 * whether the ranking counts penalties or points — and because the alternative
 * is the same three lines in two files, drifting.
 *
 * A person is only their name. A group adds its short description and, where the
 * activity says to print it, who is in it — **under the group's own name, never
 * as rows of their own**: somebody competing in a group does not appear as
 * themselves, and a row per member would score the same points twice in one
 * table.
 */
export default function ContestantName(
    { name, description, members }: { name: string, description?: string, members?: string[] }
) {
    if (!description && !members?.length) return <>{name}</>;

    return (
        <Stack gap={0}>
            <Text size="sm" fw={500}>{name}</Text>
            {description && <Text size="xs" c="dimmed">{description}</Text>}
            {members !== undefined && members.length > 0 && (
                <Text size="xs" c="dimmed">{members.join(", ")}</Text>
            )}
        </Stack>
    );
}
