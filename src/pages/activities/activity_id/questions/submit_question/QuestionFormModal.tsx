import { useState } from 'react';
import { Modal, Button, TextInput, Title, Group, Select, Textarea } from "@mantine/core";
import { useTranslation } from 'react-i18next';

export default function QuestionFormModal() {
  const [opened, setOpened] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <Button onClick={() => setOpened(true)}>{t("Send question")}</Button>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={<Title order={4}>{t("Send question")}</Title>}
        centered
      >
        <form>
        <Select
            label={t("Group")}
            placeholder={t("Search group")}
            searchable
            data={[
              { value: 'group-a', label: 'Grupa A' },
              { value: 'group-b', label: 'Grupa B' },
              { value: 'group-c', label: 'Grupa C' },
            ]}
            required
          />
          <Select
            label={t("Task")}
            placeholder={t("Search task")}
            searchable
            data={[
              { value: 'task-1', label: 'Zadanie 1' },
              { value: 'task-2', label: 'Zadanie 2' },
              { value: 'task-3', label: 'Zadanie 3' },
            ]}
            required
            mt="sm"
          />
          <TextInput
            label={t("Topic")}
            required
            mt="sm"
          />
          <Textarea
            label={t("Question")}
            required
            autosize
          />
          <Group mt="md">
            <Button type="submit">{t("Submit")}</Button>
          </Group>
        </form>
      </Modal>
    </>
  );
}
