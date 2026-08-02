import { Button, Title } from '@mantine/core';
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

function ManagerPage() {
    const { t } = useTranslation();
    return (
        <>
            <Title>{t("Manager")}</Title>
            <Button size="xl" component={Link} to="/manager/activities" m="md">{t("Activities")}</Button>
            <Button size="xl" component={Link} to="/manager/users" m="md">{t("Users")}</Button>
            <Button size="xl" component={Link} to="/manager/runners" m="md">{t("Runners")}</Button>
        </>
    )
}

export default ManagerPage;
