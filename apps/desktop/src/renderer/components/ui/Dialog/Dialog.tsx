/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- Native dialog backdrop clicks target the dialog; Escape is handled by onCancel. */
import {
  useEffect,
  useRef,
  type DialogHTMLAttributes,
  type ReactNode,
} from "react";
import styles from "./Dialog.module.css";

// The native dialog receives backdrop clicks as clicks on the dialog element.
// jsx-a11y does not model that browser behavior, while keyboard close is handled
// separately through the native cancel event below.

export function Dialog({
  open,
  onClose,
  label,
  placement = "center",
  children,
  className,
  ...props
}: Omit<DialogHTMLAttributes<HTMLDialogElement>, "open"> & {
  open: boolean;
  onClose(): void;
  label: string;
  placement?: "center" | "right";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      {...props}
      ref={ref}
      aria-label={label}
      className={[styles.root, styles[placement], className]
        .filter(Boolean)
        .join(" ")}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
