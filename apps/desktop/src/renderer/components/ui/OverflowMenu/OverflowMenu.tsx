import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Icon } from "../Icon/Icon.js";
import { IconButton } from "../IconButton/IconButton.js";
import styles from "./OverflowMenu.module.css";

const MenuContext = createContext<{ close(): void } | null>(null);

export function OverflowMenu({
  label,
  children,
  align = "end",
  disabled = false,
  className,
}: {
  label: string;
  children: ReactNode;
  align?: "start" | "end" | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const focusFrame = requestAnimationFrame(() =>
      focusItem(menuRef.current, 0),
    );
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      requestAnimationFrame(() =>
        rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus(),
      );
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={[styles.root, className].filter(Boolean).join(" ")}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <IconButton
        label={label}
        disabled={disabled}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="more" />
      </IconButton>
      {open && (
        <MenuContext.Provider value={{ close: () => setOpen(false) }}>
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            tabIndex={-1}
            aria-label={label}
            className={`${styles.menu} ${styles[align]}`}
            onKeyDown={handleMenuKeyDown}
          >
            {children}
          </div>
        </MenuContext.Provider>
      )}
    </div>
  );
}

export function OverflowMenuItem({
  children,
  description,
  leading,
  tone = "default",
  onSelect,
  className,
  type = "button",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  description?: string | undefined;
  leading?: ReactNode;
  tone?: "default" | "danger" | undefined;
  onSelect?(): void;
}) {
  const menu = useContext(MenuContext);
  return (
    <button
      {...props}
      type={type}
      role="menuitem"
      className={[styles.item, styles[tone], className]
        .filter(Boolean)
        .join(" ")}
      onClick={() => {
        onSelect?.();
        menu?.close();
      }}
    >
      {leading && <span className={styles.leading}>{leading}</span>}
      <span className={styles.itemCopy}>
        <strong>{children}</strong>
        {description && <small>{description}</small>}
      </span>
    </button>
  );
}

export function OverflowMenuSeparator() {
  return <div className={styles.separator} role="separator" />;
}

function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
  const items = getItems(event.currentTarget);
  if (items.length === 0) return;
  const currentIndex = items.findIndex(
    (item) => item === document.activeElement,
  );

  let nextIndex: number | null = null;
  if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
  if (event.key === "ArrowUp")
    nextIndex = (currentIndex - 1 + items.length) % items.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = items.length - 1;
  if (nextIndex === null) return;

  event.preventDefault();
  items[nextIndex]?.focus();
}

function focusItem(menu: HTMLDivElement | null, index: number) {
  if (!menu) return;
  getItems(menu)[index]?.focus();
}

function getItems(menu: HTMLDivElement): HTMLElement[] {
  return Array.from(
    menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'),
  );
}
