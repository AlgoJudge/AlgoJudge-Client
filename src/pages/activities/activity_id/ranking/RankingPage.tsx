import { Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

export default function RankingPage() {
    const { t } = useTranslation();
    return (
        <>
            <Title>{t("Ranking")}</Title>
        </>
    );
}
