import classes from "./CodePage.module.css";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import CodeHighlight from "@/components/codehighlight/CodeHighlight";
import { DownloadButton, CopyButton } from "@/components/buttons";
import { lightBorder } from "@/themes";

import { Button, Group, Title, MantineProvider, Text } from "@mantine/core";

interface Model {
  code: string;
  lang: string; // enum?
  extension?: string; // getExtension(lang)?
  // problem name, username, submission time, other info...
}

const data: Model = {
  code: `#include <queue>\n#include <ctime>\n#include <algorithm>\n#include <vector>\n#include <iostream>\nusing namespace std;\n\n#define INF 1e9\n\nconst int n = 20;\n\n// giga długa linia\npriority_queue<pair<double, double>, vector<pair<double, double>>, greater<pair<double, double>>> Q;\n\nvector<int> A(n + 1);\nvector<int> L(n + 1);\n\nvector<int> smallestLeft() {\n\tfor (int i = 1; i < A.size(); ++i) {\n\t\tint j = i - 1;\n\n\t\twhile (A[j] > A[i]) {\n\t\t\tj = L[j];\n\t\t}\n\n\t\tL[i] = j;\n\t}\n\n\treturn L;\n}\n\nint main() {\n\tsrand(time(NULL));\n\n\tA[0] = 0;\n\n\tfor (int i = 1; i < n; ++i) {\n\t\tA[i] = rand() % 100;\n\t}\n\n\tsmallestLeft();\n\treturn 0;\n}`,
  lang: "cpp",
  extension: "cpp",
};

export default function CodePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <>
      <Title>{t("Source code")}</Title>

      {/* Solution metadata TODO */}
      <Group>
        <Text>{t("Author")}</Text>
        <Text>{t("Submitted")}</Text>
        <Text>{t("Language")}</Text>
        <Text>{t("Submission ID")}</Text>
      </Group>

      {/* Control buttons */}
      <Group className={classes.control}>
        {/* Left side */}
        <MantineProvider theme={{ variantColorResolver: lightBorder }}>
          <Button variant="light-border" onClick={() => navigate(-1)}>
            {t("Back")}
          </Button>
        </MantineProvider>

        {/* Right side */}
        <Group>
          <CopyButton value={data.code}>
            {() => t("Copy to clipboard")}
          </CopyButton>
          <DownloadButton
            file={new Blob([data.code], { type: "text/plain" })}
            filename={"code." + data.extension}
          >
            {() => t("Download")}
          </DownloadButton>
        </Group>
      </Group>

      {/* Code */}
      <Group justify="center">
        <CodeHighlight
          code={data.code}
          language={data.lang}
          withCopyButton={false}
        ></CodeHighlight>
      </Group>
    </>
  );
}
