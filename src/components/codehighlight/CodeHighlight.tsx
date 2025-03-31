import {
  CodeHighlight as CH,
  CodeHighlightProps,
} from "@mantine/code-highlight";
import { useMantineColorScheme } from "@mantine/core";
import classes from "./CodeHighlight.module.css";

// this is slightliy hacked and can break when inside some custom theme provider

export default function CodeHighlight({
  code,
  ...props
}: CodeHighlightProps & { code: string }) {
  const lines = code.split("\n");

  const theme = useMantineColorScheme();
  const bgColor =
    theme.colorScheme === "dark"
      ? "var(--mantine-color-dark-8)"
      : "var(--mantine-color-gray-0)";

  return (
    <div style={{ width: "100%", display: "flex", position: "relative" }}>
      {/* Line Numbers */}
      <div
        className={classes.linenum}
        style={{
          backgroundColor: bgColor,
        }}
      >
        {lines.map((_, index) => (
          <div key={index}>{index + 1}</div>
        ))}
      </div>
      {/* Code */}
      <CH className={classes.code} code={code} {...props}></CH>
    </div>
  );
}
