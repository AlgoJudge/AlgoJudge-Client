import { Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import QuestionFormModal from "./submit_question/QuestionFormModal";

export default function QuestionsPage() {
    const { t } = useTranslation();
    return (
        <>
            <Title>{t("Questions and announcements")}</Title>
            <QuestionFormModal />
        </>
    );
}
