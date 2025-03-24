import { Anchor, Title } from "@mantine/core";
import classes from "./SubmissionsPage.module.css"
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

interface Model {
    /* ... */
}

const data: Model = { /* ... */};

export default function SubmissionsPage() {
    const { t } = useTranslation();
    const params = useParams();
    return (
        <>
            <Title>{t("My submissions")}</Title>
            <Anchor component={Link} to={`/activities/${params.activityId}/submissions/1`}>Example of link to specyfic submission</Anchor>
        </>
    );
}
