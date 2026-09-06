import {
    Anchor, Badge, Button, Group, Image, SimpleGrid, Stack, Text, ThemeIcon, Title,
} from "@mantine/core";
import {
    IconArrowRight, IconBolt, IconBook, IconBrandGithub, IconLogin, IconTrophy, IconUserPlus,
} from "@tabler/icons-react";
import { FC, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { registrationOffered } from "../../api/registration";
import { useInstance } from "../../provider/instanceContext";
import illustration from "../../assets/hero.png";
import classes from "./HomeHero.module.css";

/** Where the source lives, and where the project is described at length. */
const ORGANISATION = "https://github.com/AlgoJudge";
const PROJECT = "https://algojudge.pl";

/**
 * What the software says about itself, above what the installation says about
 * itself.
 *
 * ## It is the product's page, not the installation's
 *
 * Every word here is the Client's and is translated with the rest of its
 * interface — the Server holds a switch and no content. That is what keeps the
 * wording a release of one component rather than two, and it is why an
 * installation that wants to say something else writes a welcome document
 * instead of editing this: the document renders directly underneath.
 *
 * ## Nothing is a fixed colour
 *
 * The visual it was drawn from names a blue, a pale tile and a near-black. None
 * of those is written here. An installation may carry its own palette, and a
 * hero painted in the product's blue on a page painted in a university's would
 * be the one panel that ignored them — so this asks Mantine for the primary
 * colour and its own dimmed text, exactly as every other screen does.
 *
 * The illustration is the one thing that cannot follow a palette. It is a
 * drawing with a transparent ground, so it sits on whatever colour is behind
 * it, and it carries no text to translate.
 */

const Feature: FC<{ icon: ReactNode; title: string; children: string }> =
    ({ icon, title, children }) => (
        <Group wrap="nowrap" align="flex-start" gap="md">
            <ThemeIcon variant="light" size={52} radius="md">{icon}</ThemeIcon>
            <Stack gap={2}>
                <Text fw={700}>{title}</Text>
                <Text size="sm" c="dimmed">{children}</Text>
            </Stack>
        </Group>
    );

export const HomeHero: FC = () => {
    const { t } = useTranslation();
    const { instance } = useInstance();

    return (
        <div className={classes.section} data-testid="home-hero">
            <div className={classes.hero}>
                <Stack gap="lg" align="flex-start">
                    <Badge
                        component="a"
                        href={ORGANISATION}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="light"
                        size="lg"
                        radius="xl"
                        leftSection={<IconBrandGithub size={16} />}
                        tt="none"
                        style={{ cursor: "pointer" }}
                        // A little more air than the column's own rhythm, here
                        // and before the buttons: the badge is a label rather
                        // than a first line, and the buttons are the end of the
                        // argument rather than the next sentence of it.
                        mb="xs"
                    >
                        {t("Open source · Self-hosted")}
                    </Badge>

                    <Title order={1} className={classes.title}>
                        {t("Programming contests and courses with automatic evaluation")}
                    </Title>

                    <Text size="lg" c="dimmed" maw={620}>
                        {t("AlgoJudge is open-source, self-hosted software for programming contests and courses, with automatic evaluation of submitted solutions.")}
                    </Text>

                    <Group mt="xs">
                        <Button
                            component={Link}
                            to="/login"
                            size="md"
                            data-testid="sign-in"
                            leftSection={<IconLogin size={18} />}
                        >
                            {t("Sign in")}
                        </Button>
                        {/* A provider counts as a way in, which is why this is
                            not the local sign-up flag on its own. */}
                        {registrationOffered(instance) && (
                            <Button
                                component={Link}
                                to="/register"
                                size="md"
                                variant="default"
                                leftSection={<IconUserPlus size={18} />}
                            >
                                {t("Create account")}
                            </Button>
                        )}
                    </Group>

                    <Anchor href={PROJECT} target="_blank" rel="noopener noreferrer">
                        <Group gap={6} wrap="nowrap">
                            {t("About the project")}
                            <IconArrowRight size={16} />
                        </Group>
                    </Anchor>
                </Stack>

                <Image src={illustration} alt="" className={classes.picture} />
            </div>

            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xl">
                <Feature icon={<IconTrophy size={26} />} title={t("Contests")}>
                    {t("Organise programming competitions")}
                </Feature>
                <Feature icon={<IconBook size={26} />} title={t("Courses")}>
                    {t("Create materials for students")}
                </Feature>
                <Feature icon={<IconBolt size={26} />} title={t("Automatic evaluation")}>
                    {t("Fast and reliable verification of solutions")}
                </Feature>
            </SimpleGrid>
        </div>
    );
};

export default HomeHero;
