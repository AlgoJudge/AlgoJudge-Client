import { Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

export default function RulesPage() {
    const { t } = useTranslation();
    return (
        <>
            <Title>{t("Rules")}</Title>
        </>
    );
}
