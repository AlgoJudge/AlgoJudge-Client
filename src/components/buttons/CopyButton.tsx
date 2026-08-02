import { ActionButton } from "./ActionButton";
import { useProps } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";

export interface CopyButtonProps {
  children: (payload: { copied: boolean; copy: () => void }) => React.ReactNode;

  /** Value that will be copied to the clipboard when the button is clicked */
  value: string;

  /** Active state timeout in ms, `1000` by default */
  timeout?: number;
}

export function CopyButton(props: CopyButtonProps) {
  const { children, timeout, value, ...others } = useProps(
    "CopyButton",
    {},
    props
  );

  const clipboard = useClipboard({ timeout });
  const copyAction = () => clipboard.copy(value);

  return (
    <ActionButton action={copyAction} timeout={timeout}>
      {({ active, action }) => (
        <>{children({ copy: action, copied: active, ...others })}</>
      )}
    </ActionButton>
  );
}
