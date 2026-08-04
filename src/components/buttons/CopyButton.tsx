import { ActionButton, ActionButtonProps } from "./ActionButton";
import { useProps } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";

export interface CopyButtonProps extends Omit<ActionButtonProps, "children" | "action"> {
  /** Renders the label. Not another button — see `ActionButton`. */
  children: (payload: { copied: boolean; copy: () => void }) => React.ReactNode;

  /** Value that will be copied to the clipboard when the button is clicked */
  value: string;
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
    <ActionButton action={copyAction} timeout={timeout} {...others}>
      {({ active, action }) => (
        <>{children({ copy: action, copied: active })}</>
      )}
    </ActionButton>
  );
}
