import { Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

export default function SubmitPage() {
    const { t } = useTranslation();
    return (
        <>
            <Title>{t("Submit")}</Title>
        </>
    );
}
