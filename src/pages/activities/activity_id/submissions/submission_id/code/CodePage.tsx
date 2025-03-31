import classes from "./CodePage.module.css";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { IconCheck } from "@tabler/icons-react";

import CodeHighlight from "@/components/codehighlight/CodeHighlight";

import {
  Button,
  CopyButton,
  Group,
  Title,
  defaultVariantColorsResolver,
  VariantColorsResolver,
  parseThemeColor,
  rgba,
  darken,
  MantineProvider,
} from "@mantine/core";

const variantColorResolver: VariantColorsResolver = (input) => {
  const defaultResolvedColors = defaultVariantColorsResolver(input);
  const parsedColor = parseThemeColor({
    color: input.color || input.theme.primaryColor,
    theme: input.theme,
  });

  // Add new variants support
  if (input.variant === "light-border") {
    return {
      background: rgba(parsedColor.value, 0.1),
      hover: rgba(parsedColor.value, 0.15),
      border: `1px solid ${parsedColor.value}`,
      color: darken(parsedColor.value, 0.1),
    };
  }

  return defaultResolvedColors;
};

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

  const [downloaded, setDownloadStatus] = useState(false);

  const downloadCode = () => {
    const element = document.createElement("a");
    const file = new Blob([data.code], {
      type: "text/plain",
    });
    element.href = URL.createObjectURL(file);
    element.download = "code" + "." + data.extension;
    document.body.appendChild(element);
    element.click();

    setDownloadStatus(true);
    setTimeout(() => setDownloadStatus(false), 500);
  };

  return (
    <>
      <Title>{t("Source code")}</Title>

      <Group className={classes.control}>
        <MantineProvider theme={{ variantColorResolver }}>
          <Button variant="light-border" onClick={() => navigate(-1)}>
            {t("Back")}
          </Button>
        </MantineProvider>

        <Group>
          <CopyButton value={data.code}>
            {({ copied, copy }) => (
              <Button
                style={{ width: "110px" }}
                variant={copied ? "filled" : "default"}
                color="teal"
                className={classes.fixedw}
                onClick={copy}
              >
                {copied ? <IconCheck size={16} /> : t("Copy code")}
              </Button>
            )}
          </CopyButton>

          <Button
            style={{ width: "140px" }}
            variant={downloaded ? "filled" : "default"}
            color="teal"
            className={classes.fixedw}
            onClick={downloadCode}
          >
            {downloaded ? <IconCheck size={16} /> : t("Download code")}
          </Button>
        </Group>
      </Group>

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
