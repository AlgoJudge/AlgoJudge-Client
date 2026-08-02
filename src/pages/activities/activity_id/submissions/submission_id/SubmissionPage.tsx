import { Button, Grid, Group, Stack, Title, Text, Table, Container } from "@mantine/core";
import classes from "./SubmissionPage.module.css"
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";


interface SubmissionDetails {
    id: string;
    author: string;
    timeOfSubmission: string;
    dateOfSubmission: string;
    language: string;
    result: number;
    maxResult: number;
    status: string;

}

interface Test {
    testNo: string;
    status: string;
    time: number;
    timeLimit: number;
    memory: number;
    memoryLimit: number;
    result: number;
    maxResult: number;
    comments: string;

}

interface Model {
    taskName: string;
    taskId: number;
    submission: SubmissionDetails;
    tests: Test[];
}

const data: Model = {
    taskName: "Tytul Zadania",
    taskId: 111,
    submission: {
        id: "69",
        author: "Sigma Boy",
        timeOfSubmission: "21:37:00",
        dateOfSubmission: "24.12.1998",
        language: "C--",
        result: 10,
        maxResult: 40,
        status: "OK"
    },
    tests: [
        {
            testNo: "1",
            status: "OK",
            time: 20,
            timeLimit: 1000,
            memory: 0,
            memoryLimit: 32,
            result: 10,
            maxResult: 10,
            comments: ""

        },
        {
            testNo: "2",
            status: "ERROR",
            time: 20,
            timeLimit: 1000,
            memory: 0,
            memoryLimit: 32,
            result: 0,
            maxResult: 10,
            comments: "Abnormal Program Termination, exit status: 6"

        },
        {
            testNo: "3",
            status: "ERROR",
            time: 1000,
            timeLimit: 1000,
            memory: 0,
            memoryLimit: 32,
            result: 0,
            maxResult: 10,
            comments: "Time limit exceeded"
        },
        {
            testNo: "4",
            status: "ERROR",
            time: 20,
            timeLimit: 1000,
            memory: 0,
            memoryLimit: 32,
            result: 0,
            maxResult: 10,
            comments: "Warning: control reaches end of non void function"

        },

    ]

};
//helper functions
const getStatusBackground = (status: string) => {
    switch (status) {
        case "OK":
            return classes.submissionSuccessBackground;
        case "ERROR":
            return classes.submissionErrorBackground;
        case "WARNING":
            return classes.submissionWarningBackground;
        default:
            return "";
    }
}
const getStatusText = (status: string) => {
    switch (status) {
        case "OK":
            return classes.submissionSuccessText;
        case "ERROR":
            return classes.submissionErrorText;
        case "WARNING":
            return classes.submissionWarningText;
        default:
            return "";
    }
}
const getTimeBackground = (time: number, maxTime: number) => {
    if (time >= maxTime) {
        return classes.submissionErrorBackground;
    }
    else if (time > maxTime / 2 + 1) {
        return classes.submissionWarningBackground;
    }
    else {
        return "";
    }
}
//components
const SubmissionHeader = (props: { taskName: string }) => {
    const { t } = useTranslation();
    return (
        <Stack
            align="flex-start"
            justify="flex-start"
            gap="xs"
        >
            <Title order={2}> {t("Submission")} </Title>
            <Title order={1}> {props.taskName}</Title>
        </Stack>
    );
}

const SubmissionDetails = (props: { details: SubmissionDetails }) => {
    const { t } = useTranslation();
    return (
        <Stack
            justify="flex-start"
            align="flex-start"
            gap="xs"
            className={classes.verticalLineText}
        >
            <Text>
                <Text component="span" fw={700}> {t("Author")}: </Text>
                {props.details.author}
            </Text>
            <Text>
                <Text component="span" fw={700}> {t("Submission date")}: </Text>
                {props.details.timeOfSubmission} {props.details.dateOfSubmission}
            </Text >
            <Text>
                <Text component="span" fw={700}> {t("Language")}: </Text>
                {props.details.language}
            </Text>
            <Text>
                <Text component="span" fw={700}>
                    {t("ID")}:</Text> {props.details.id}
            </Text>
            <Text>
                <Text component="span" fw={700}> {t("Result")}:</Text>
                {props.details.result} / {props.details.maxResult}
            </Text>
            <Text>
                <Text component="span" fw={700}> {t("Status")}:</Text>
                <span className={getStatusText(props.details.status)}> {props.details.status} </span>
            </Text>
        </Stack >
    )
}

const SubmissionTests = (props: { tests: Test[] }) => {
    const { t } = useTranslation();
    const rows = props.tests.map((test) => (
        <Table.Tr key={test.testNo}>
            <Table.Td> {test.testNo} </Table.Td>
            <Table.Td className={getStatusBackground(test.status)}> {t(test.status)} </Table.Td>
            <Table.Td className={getTimeBackground(test.time, test.timeLimit)}> {(test.time / 1000).toFixed(2)}s / {(test.timeLimit / 1000).toFixed(2)}s </Table.Td>
            <Table.Td className={getTimeBackground(test.memory, test.memoryLimit)}> {test.memory} / {test.memoryLimit} </Table.Td>
            <Table.Td> {test.result} / {test.maxResult} </Table.Td>
            <Table.Td> {test.comments} </Table.Td>
        </Table.Tr>
    ));
    return (
        <Table withTableBorder withColumnBorders >
            <Table.Thead fw={700}>
                <Table.Td> {t("Test")} </Table.Td>
                <Table.Td> {t("Status")} </Table.Td>
                <Table.Td> {t("Time")} </Table.Td>
                <Table.Td> {t("Memory")} </Table.Td>
                <Table.Td> {t("Result")} </Table.Td>
                <Table.Td> {t("Comments")} </Table.Td>
            </Table.Thead>
            <Table.Tbody>
                {rows}
            </Table.Tbody>
        </Table>
    );
}


export default function SubmissionPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const params = useParams();
    return (
        <Container size="90%">
            {/*<Title>{t("Submission")}</Title>*/}
            <Group justify="space-between">
                <Button onClick={() => navigate(-1)}>{t("Back")}</Button>
                <Button component={Link} to={`/activities/${params.activityId}/submissions/${params.submissionId}/code`}>{t("Source code")}</Button>
            </Group>
            <Grid style={{ marginTop: "20px" }}>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                    <SubmissionHeader taskName={data.taskName} />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Group justify="flex-end">
                        <SubmissionDetails details={data.submission} />
                    </Group>
                </Grid.Col>
            </Grid>
            <SubmissionTests tests={data.tests} />
        </Container >

    );
}
