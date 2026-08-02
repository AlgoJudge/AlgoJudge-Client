import { ActionButton } from "./ActionButton";
import { useProps } from "@mantine/core";

export interface DownloadButtonProps {
  children: (payload: {
    downloaded: boolean;
    download: () => void;
  }) => React.ReactNode;

  /** Content of the file that will be downloaded when the button is clicked */
  file: Blob;

  /** Filename that will be used for the file when the button is clicked */
  filename: string;

  /** Active state timeout in ms, `1000` by default */
  timeout?: number;
}

export function DownloadButton(props: DownloadButtonProps) {
  const { children, timeout, filename, file, ...others } = useProps(
    "DownloadButton",
    {},
    props
  );
  const downloadAction = () => {
    const element = document.createElement("a");
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(element.href);
  };

  return (
    <ActionButton action={downloadAction} timeout={timeout}>
      {({ active, action }) => (
        <>{children({ download: action, downloaded: active, ...others })}</>
      )}
    </ActionButton>
  );
}
