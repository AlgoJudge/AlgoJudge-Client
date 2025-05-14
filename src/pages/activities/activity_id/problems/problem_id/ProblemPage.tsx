import {Button, Group, Stack, Title} from "@mantine/core";
import classes from "./ProblemPage.module.css"
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

interface Problem {
    id: string,
    name: string,
    pdf: string
}

const data: Problem = {
    id: "P1",
    name: "Problem 1",
    pdf: "https://www.mat.umk.pl/panel/wp-content/uploads/matematyka.pdf"
};

export default function ProblemPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const params = useParams();
    return (
        <>
            <Stack spacing={2}>
                <Title>{data.name}</Title>
                <Group justify="space-between">
                    <Button onClick={() => navigate(-1)}>{t("Back")}</Button>
                    <Group>
                        <Button component={Link} to={data.pdf} download target="_self">{t("Download problem")}</Button>
                        <Button component={Link} to={`/activities/${params.activityId}/submit/${params.problemId}`}>{t("Submit")}</Button>
                    </Group>
                </Group>
                <Group h={600}>
                    <object data={data.pdf} type="application/pdf" width="100%" height="100%">
                        <p>{t("PDF should be here")}</p>
                    </object>
                </Group>
            </Stack>
        </>
    );
}
