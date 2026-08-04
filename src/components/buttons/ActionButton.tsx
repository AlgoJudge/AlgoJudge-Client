import { useState } from "react";
import { useProps, Button, ButtonProps } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";

/* Mostly copy of mantine CopyButton but with arbitrary callback action and some styling */
/* @mantine/core/src/components/CopyButton/CopyButton.tsx */

/**
 * This component **is** the button. The children callback renders its label —
 * an icon, a word, or both — and must not render another button: a `<button>`
 * inside a `<button>` is invalid, and it looks like the doubled control it is.
 *
 * Styling is passed through to Mantine's `Button`, so a caller that wants a
 * subtle compact one says so here rather than by nesting one inside.
 */
export interface ActionButtonProps extends Omit<ButtonProps, "children" | "onClick"> {
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
  const { children, timeout, action, variant, color, style, ...others } = useProps(
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
      variant={active ? "filled" : variant ?? "default"}
      color={color ?? "teal"}
      onClick={actionWrapper}
      // Relative, so the confirmation mark can sit over the label. A caller's
      // own styles are kept beside it rather than replaced.
      style={{ position: "relative", ...(typeof style === "object" ? style : {}) }}
      {...others}
    >
      <span style={{ visibility: active ? "hidden" : "visible" }}>
        {children({ action: actionWrapper, active })}
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
