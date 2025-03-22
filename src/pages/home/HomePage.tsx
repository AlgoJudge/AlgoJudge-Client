import { Button } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

function HomePage() {
    const { t } = useTranslation();

    return (
        <>
            <h1>{t('Home')}</h1>
            <Button size="xl" component={Link} to="/activities">Participant panel</Button>
        </>
    )
}

export default HomePage;