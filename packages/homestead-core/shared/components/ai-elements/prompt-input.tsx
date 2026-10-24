// Vendored from AI Elements (vercel/ai-elements, Apache-2.0); see ./README.md.
// Subset: the prompt with file attachments (picker, paste, drop). Menus, model
// select, referenced sources, screenshots and the command palette are left out
// until something needs them.
import type { ChatStatus, FileUIPart } from "ai";
import { CornerDownLeftIcon, Loader2Icon, PaperclipIcon, SquareIcon, XIcon } from "lucide-react";
import type {
  ChangeEventHandler,
  ClipboardEventHandler,
  ComponentProps,
  FormEvent,
  FormEventHandler,
  HTMLAttributes,
  KeyboardEventHandler,
  MouseEvent,
  RefObject,
} from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@rambleraptor/homestead-core/shared/components/ui/input-group";
import { cn } from "@rambleraptor/homestead-core/shared/lib/utils";

// ============================================================================
// Helpers
// ============================================================================

/** A file's bytes as a data URL. (Upstream fetches the blob URL and uses a
 * FileReader; reading the `File` it was made from needs neither.) */
const readAsDataUrl = async (file: Blob): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`;
};

/** Whether a file's type is one of `accept`'s (`image/*, application/pdf`). */
const matchesAccept = (file: File, accept: string | undefined): boolean => {
  if (!accept || accept.trim() === "") {
    return true;
  }
  return accept
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .some((pattern) =>
      pattern.endsWith("/*") ? file.type.startsWith(pattern.slice(0, -1)) : file.type === pattern,
    );
};

// ============================================================================
// Attachments context
// ============================================================================

export type PromptInputFile = FileUIPart & { id: string };

/** A composer file and the `File` it came from. */
type HeldFile = PromptInputFile & { file: File };

export interface AttachmentsContext {
  files: PromptInputFile[];
  add: (files: File[] | FileList) => void;
  remove: (id: string) => void;
  clear: () => void;
  openFileDialog: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
}

const LocalAttachmentsContext = createContext<AttachmentsContext | null>(null);

export const usePromptInputAttachments = () => {
  const context = useContext(LocalAttachmentsContext);
  if (!context) {
    throw new Error("usePromptInputAttachments must be used within a PromptInput");
  }
  return context;
};

// ============================================================================
// PromptInput
// ============================================================================

export interface PromptInputMessage {
  text: string;
  files: FileUIPart[];
}

export type PromptInputProps = Omit<HTMLAttributes<HTMLFormElement>, "onSubmit" | "onError"> & {
  // e.g., "image/*" or leave undefined for any
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  // bytes
  maxFileSize?: number;
  onError?: (err: { code: "max_files" | "max_file_size" | "accept"; message: string }) => void;
  onSubmit: (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => void | Promise<void>;
};

export const PromptInput = ({
  className,
  accept,
  multiple,
  maxFiles,
  maxFileSize,
  onError,
  onSubmit,
  children,
  ...props
}: PromptInputProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [items, setItems] = useState<HeldFile[]>([]);

  // Keep a ref to files for cleanup on unmount (avoids stale closure).
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(
    () => () => {
      for (const f of itemsRef.current) {
        if (f.url) URL.revokeObjectURL(f.url);
      }
    },
    [],
  );

  const add = useCallback(
    (fileList: File[] | FileList) => {
      const incoming = [...fileList];
      const accepted = incoming.filter((f) => matchesAccept(f, accept));
      if (accepted.length < incoming.length) {
        onError?.({ code: "accept", message: "Some files aren't a type this accepts." });
      }
      const sized = accepted.filter((f) => (maxFileSize ? f.size <= maxFileSize : true));
      if (sized.length < accepted.length) {
        onError?.({ code: "max_file_size", message: "Some files are too large." });
      }
      setItems((prev) => {
        const capacity = typeof maxFiles === "number" ? Math.max(0, maxFiles - prev.length) : undefined;
        const capped = typeof capacity === "number" ? sized.slice(0, capacity) : sized;
        if (typeof capacity === "number" && sized.length > capacity) {
          onError?.({ code: "max_files", message: "Too many files. Some were not added." });
        }
        return [
          ...prev,
          ...capped.map((file) => ({
            file,
            filename: file.name,
            id: crypto.randomUUID(),
            mediaType: file.type,
            type: "file" as const,
            url: URL.createObjectURL(file),
          })),
        ];
      });
    },
    [accept, maxFiles, maxFileSize, onError],
  );

  const remove = useCallback(
    (id: string) =>
      setItems((prev) => {
        const found = prev.find((f) => f.id === id);
        if (found?.url) URL.revokeObjectURL(found.url);
        return prev.filter((f) => f.id !== id);
      }),
    [],
  );

  const clear = useCallback(
    () =>
      setItems((prev) => {
        for (const f of prev) {
          if (f.url) URL.revokeObjectURL(f.url);
        }
        return [];
      }),
    [],
  );

  const openFileDialog = useCallback(() => {
    inputRef.current?.click();
  }, []);

  // Files dropped on the form are attached.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) add(e.dataTransfer.files);
    };
    form.addEventListener("dragover", onDragOver);
    form.addEventListener("drop", onDrop);
    return () => {
      form.removeEventListener("dragover", onDragOver);
      form.removeEventListener("drop", onDrop);
    };
  }, [add]);

  const handleChange: ChangeEventHandler<HTMLInputElement> = useCallback(
    (event) => {
      if (event.currentTarget.files) add(event.currentTarget.files);
      // Reset so a file removed and picked again still fires a change.
      event.currentTarget.value = "";
    },
    [add],
  );

  const handleSubmit: FormEventHandler<HTMLFormElement> = useCallback(
    async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const field = form.elements.namedItem("message");
      const text = field instanceof HTMLTextAreaElement ? field.value : "";
      const sent = items;

      // Clear straight away so typing during the send isn't lost to a late
      // reset; put the text and files back if the send fails, to retry.
      form.reset();
      setItems([]);
      try {
        // Blob URLs die with the composer's state; send the bytes as data URLs.
        const files: FileUIPart[] = await Promise.all(
          sent.map(async ({ id: _id, file, ...item }) => ({
            ...item,
            url: await readAsDataUrl(file),
          })),
        );
        await onSubmit({ text, files }, event);
        for (const f of sent) {
          if (f.url) URL.revokeObjectURL(f.url);
        }
      } catch {
        if (field instanceof HTMLTextAreaElement && field.value === "") {
          field.value = text;
        }
        setItems((prev) => [...sent, ...prev]);
      }
    },
    [items, onSubmit],
  );

  const attachments = useMemo<AttachmentsContext>(
    () => ({
      files: items.map(({ file: _file, ...item }) => item),
      add,
      remove,
      clear,
      openFileDialog,
      fileInputRef: inputRef,
    }),
    [items, add, remove, clear, openFileDialog],
  );

  return (
    <LocalAttachmentsContext.Provider value={attachments}>
      <input
        accept={accept}
        aria-label="Upload files"
        className="hidden"
        multiple={multiple}
        onChange={handleChange}
        ref={inputRef}
        title="Upload files"
        type="file"
      />
      <form className={cn("w-full", className)} onSubmit={handleSubmit} ref={formRef} {...props}>
        <InputGroup className="overflow-hidden">{children}</InputGroup>
      </form>
    </LocalAttachmentsContext.Provider>
  );
};

export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputBody = ({ className, ...props }: PromptInputBodyProps) => (
  <div className={cn("contents", className)} {...props} />
);

export type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>;

export const PromptInputTextarea = ({
  onKeyDown,
  className,
  placeholder = "What would you like to know?",
  ...props
}: PromptInputTextareaProps) => {
  const attachments = usePromptInputAttachments();
  const [isComposing, setIsComposing] = useState(false);

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (e) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) {
        return;
      }

      if (e.key === "Enter") {
        if (isComposing || e.nativeEvent.isComposing) {
          return;
        }
        if (e.shiftKey) {
          return;
        }
        e.preventDefault();

        const { form } = e.currentTarget;
        const submitButton = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
        if (submitButton?.disabled) {
          return;
        }

        form?.requestSubmit();
      }

      // Remove the last attachment when Backspace is pressed in an empty box.
      if (e.key === "Backspace" && e.currentTarget.value === "" && attachments.files.length > 0) {
        e.preventDefault();
        const last = attachments.files.at(-1);
        if (last) attachments.remove(last.id);
      }
    },
    [onKeyDown, isComposing, attachments],
  );

  const handlePaste: ClipboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      const files: File[] = [];
      for (const item of event.clipboardData?.items ?? []) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        event.preventDefault();
        attachments.add(files);
      }
    },
    [attachments],
  );

  const handleCompositionEnd = useCallback(() => setIsComposing(false), []);
  const handleCompositionStart = useCallback(() => setIsComposing(true), []);

  return (
    <InputGroupTextarea
      className={cn("field-sizing-content max-h-48 min-h-16", className)}
      name="message"
      onCompositionEnd={handleCompositionEnd}
      onCompositionStart={handleCompositionStart}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      placeholder={placeholder}
      {...props}
    />
  );
};

export type PromptInputHeaderProps = Omit<ComponentProps<typeof InputGroupAddon>, "align">;

export const PromptInputHeader = ({ className, ...props }: PromptInputHeaderProps) => (
  <InputGroupAddon align="block-end" className={cn("order-first flex-wrap gap-1", className)} {...props} />
);

export type PromptInputFooterProps = Omit<ComponentProps<typeof InputGroupAddon>, "align">;

export const PromptInputFooter = ({ className, ...props }: PromptInputFooterProps) => (
  <InputGroupAddon align="block-end" className={cn("justify-between gap-1", className)} {...props} />
);

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputTools = ({ className, ...props }: PromptInputToolsProps) => (
  <div className={cn("flex min-w-0 items-center gap-1", className)} {...props} />
);

export type PromptInputButtonProps = ComponentProps<typeof InputGroupButton>;

export const PromptInputButton = ({ variant = "ghost", className, size, ...props }: PromptInputButtonProps) => (
  <InputGroupButton
    className={cn(className)}
    size={size ?? "icon-sm"}
    type="button"
    variant={variant}
    {...props}
  />
);

export type PromptInputActionAddAttachmentsProps = PromptInputButtonProps & {
  label?: string;
};

/** Opens the file picker. (Upstream offers this as a menu item; here, a button.) */
export const PromptInputActionAddAttachments = ({
  label = "Add photos or files",
  children,
  ...props
}: PromptInputActionAddAttachmentsProps) => {
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputButton aria-label={label} onClick={() => attachments.openFileDialog()} {...props}>
      {children ?? <PaperclipIcon className="size-4" />}
    </PromptInputButton>
  );
};

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  status?: ChatStatus;
  onStop?: () => void;
};

export const PromptInputSubmit = ({
  className,
  variant = "default",
  size = "icon-sm",
  status,
  onStop,
  onClick,
  children,
  ...props
}: PromptInputSubmitProps) => {
  const isGenerating = status === "submitted" || status === "streaming";

  let Icon = <CornerDownLeftIcon className="size-4" />;

  if (status === "submitted") {
    Icon = <Loader2Icon className="size-4 animate-spin" />;
  } else if (status === "streaming") {
    Icon = <SquareIcon className="size-4" />;
  } else if (status === "error") {
    Icon = <XIcon className="size-4" />;
  }

  const handleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      if (isGenerating && onStop) {
        e.preventDefault();
        onStop();
        return;
      }
      onClick?.(e);
    },
    [isGenerating, onStop, onClick],
  );

  return (
    <InputGroupButton
      aria-label={isGenerating ? "Stop" : "Submit"}
      className={cn(className)}
      onClick={handleClick}
      size={size}
      type={isGenerating && onStop ? "button" : "submit"}
      variant={variant}
      {...props}
    >
      {children ?? Icon}
    </InputGroupButton>
  );
};
