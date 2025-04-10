import { useState } from "react";
import { useProps, Button } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";

/* Mostly copy of mantine CopyButton but with arbitrary callback action and some styling */
/* @mantine/core/src/components/CopyButton/CopyButton.tsx */

export interface ActionButtonProps {
  /** Children callback, provides current button status and click function (action) as an argument */
  children: (payload: {
    active: boolean;
    action: () => void;
  }) => React.ReactNode;

  /** Function to be executed on button click */
  action: () => void;

  /** Active state timeout in ms, `1000` by default */
  timeout?: number;
}

const defaultProps: Partial<ActionButtonProps> = {
  timeout: 1000,
};

export function ActionButton(props: ActionButtonProps) {
  const { children, timeout, action, ...others } = useProps(
    "ActionButton",
    defaultProps,
    props
  );
  const [active, setActive] = useState<boolean>(false);
  const actionWrapper = () => {
    action();
    setActive(true);
    setTimeout(() => setActive(false), timeout);
  };
  return (
    <Button
      variant={active ? "filled" : "default"}
      color="teal"
      onClick={actionWrapper}
      style={{ position: "relative" }}
    >
      <span style={{ visibility: active ? "hidden" : "visible" }}>
        {children({ action: actionWrapper, active, ...others })}
      </span>
      {active && (
        <IconCheck
          size={16}
          style={{
            position: "absolute",
            marginLeft: "auto",
            marginRight: "auto",
            left: "0",
            right: "0",
          }}
        />
      )}
    </Button>
  );
}
