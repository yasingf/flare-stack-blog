import "@fontsource-variable/jetbrains-mono/wght.css";
import "katex/dist/katex.min.css";
import type {
  Extensions,
  JSONContent,
  Editor as TiptapEditor,
} from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { memo, useState, useRef, lazy, Suspense } from "react";
import { toast } from "sonner";
import { MarkdownSourceEditor } from "./ui/markdown-source-editor";
import { jsonToMarkdown, markdownToHtml } from "./utils/markdown-converter";
const GuitarProModal = lazy(() => import("./ui/guitar-pro-modal"));
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EditorOverlays } from "./ui/editor-overlays";
import EditorToolbar from "./ui/editor-toolbar";

interface EditorProps {
  content?: JSONContent | string;
  onUpdate?: (editor: TiptapEditor) => void;
  onCreated?: (editor: TiptapEditor | null) => void;
  extensions: Extensions;
  editable?: boolean;
  className?: string;
  contentClassName?: string;
  documentHeader?: ReactNode;
  documentClassName?: string;
  scrollContainerId?: string;
  toolbarClassName?: string;
}

export const Editor = memo(function Editor({
  content,
  onUpdate,
  onCreated,
  extensions,
  editable = true,
  className,
  contentClassName,
  documentHeader,
  documentClassName,
  scrollContainerId,
  toolbarClassName,
}: EditorProps) {
  const [markdownMode, setMarkdownMode] = useState(false);
  const [markdown, setMarkdown] = useState("");
  const markdownRevision = useRef(0);
  const [guitarOpen, setGuitarOpen] = useState(false);
  const editor = useEditor({
    extensions,
    content,
    editable,
    onCreate: ({ editor: currentEditor }) => {
      onCreated?.(currentEditor);
    },
    onUpdate: ({ editor: currentEditor }) => {
      onUpdate?.(currentEditor);
    },
    onDestroy: () => {
      onCreated?.(null);
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose dark:prose-invert prose-base max-w-none! fuwari-custom-md focus:outline-none min-h-[500px]",
          !editable && "min-h-0",
          contentClassName,
        ),
      },
    },
    immediatelyRender: false,
  });

  return (
    <div className={cn("relative flex flex-col group", className)}>
      {editable && (
        <div className="flex gap-3 text-sm my-2">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-sm transition-colors aria-pressed:bg-muted aria-pressed:font-medium"
            aria-pressed={!markdownMode}
            onClick={() => setMarkdownMode(false)}
          >
            富文本
          </button>
          <button
            type="button"
            className="rounded px-3 py-1.5 text-sm transition-colors aria-pressed:bg-muted aria-pressed:font-medium"
            aria-pressed={markdownMode}
            onClick={() => {
              if (!markdownMode)
                setMarkdown(jsonToMarkdown(editor?.getJSON() ?? null));
              setMarkdownMode(true);
            }}
          >
            Markdown
          </button>
        </div>
      )}
      {editable && !markdownMode && (
        <EditorToolbar
          editor={editor}
          className={toolbarClassName}
          onLinkClick={() => editor?.commands.openLinkEditor()}
          onImageClick={() => editor?.commands.insertImagePlaceholder()}
          onVideoClick={() => editor?.commands.insertVideo()}
          onGuitarClick={() => setGuitarOpen(true)}
          onFormulaInlineClick={() => editor?.commands.insertMath("inline")}
          onFormulaBlockClick={() => editor?.commands.insertMath("block")}
        />
      )}

      {editable && !markdownMode && <EditorOverlays editor={editor} />}
      {editable && guitarOpen && (
        <Suspense fallback={null}>
          <GuitarProModal
            isOpen={guitarOpen}
            onClose={() => setGuitarOpen(false)}
            onSubmit={(src, fileName) => {
              editor
                ?.chain()
                .focus()
                .insertContent({ type: "guitarPro", attrs: { src, fileName } })
                .run();
              setGuitarOpen(false);
            }}
          />
        </Suspense>
      )}

      <div
        id={scrollContainerId}
        className={cn("relative", documentClassName ?? "min-h-125")}
      >
        {documentHeader}
        {markdownMode && editable && (
          <MarkdownSourceEditor
            value={markdown}
            onChange={(value) => {
              setMarkdown(value);
              const revision = ++markdownRevision.current;
              void markdownToHtml(value)
                .then((html) => {
                  if (
                    revision === markdownRevision.current &&
                    editor &&
                    !editor.isDestroyed
                  )
                    editor.commands.setContent(html, { emitUpdate: true });
                })
                .catch(() => toast.error("无法解析 Markdown，请检查内容"));
            }}
          />
        )}
        <div hidden={markdownMode && editable}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
});
