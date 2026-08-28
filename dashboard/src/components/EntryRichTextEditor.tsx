import { useId, useState } from "react";
import { EditorContent, useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code,
  CodeXml,
  Link,
  Undo2,
  Redo2,
  RemoveFormatting,
  Table2,
  SlidersHorizontal,
} from "lucide-react";
import { safeEntryLink } from "../lib/entryContent";

export default function EntryRichTextEditor({
  editor,
  disabled,
  focused,
  variant = "full",
}: {
  editor: Editor | null;
  disabled: boolean;
  focused: boolean;
  variant?: "full" | "compact";
}) {
  const linkId = useId();
  const [moreFormatting, setMoreFormatting] = useState(false);
  const compact = variant === "compact";
  const showAllFormatting = !compact || moreFormatting;
  const [showLink, setShowLink] = useState(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState("");
  useEditorState({ editor, selector: ({ editor: current }) => current?.state });
  if (!editor) return null;

  const actions = [
    {
      label: "Undo",
      compact: true,
      icon: Undo2,
      run: () => editor.chain().focus().undo().run(),
      disabled: !editor.can().undo(),
    },
    {
      label: "Redo",
      compact: true,
      icon: Redo2,
      run: () => editor.chain().focus().redo().run(),
      disabled: !editor.can().redo(),
    },
    {
      label: "Bold",
      compact: true,
      icon: Bold,
      active: editor.isActive("bold"),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "Italic",
      compact: true,
      icon: Italic,
      active: editor.isActive("italic"),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "Underline",
      icon: Underline,
      active: editor.isActive("underline"),
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      label: "Strikethrough",
      icon: Strikethrough,
      active: editor.isActive("strike"),
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: "Highlight",
      icon: Highlighter,
      active: editor.isActive("highlight"),
      run: () => editor.chain().focus().toggleHighlight().run(),
    },
    {
      label: "Bulleted list",
      compact: true,
      icon: List,
      active: editor.isActive("bulletList"),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      compact: true,
      icon: ListOrdered,
      active: editor.isActive("orderedList"),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Checkbox list",
      compact: true,
      icon: ListChecks,
      active: editor.isActive("taskList"),
      run: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      label: "Quote",
      icon: Quote,
      active: editor.isActive("blockquote"),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "Inline code",
      icon: Code,
      active: editor.isActive("code"),
      run: () => editor.chain().focus().toggleCode().run(),
    },
    {
      label: "Code block",
      icon: CodeXml,
      active: editor.isActive("codeBlock"),
      run: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: "Link",
      compact: true,
      icon: Link,
      active: editor.isActive("link"),
      run: () => {
        setLink(String(editor.getAttributes("link").href ?? ""));
        setLinkError("");
        setShowLink((value) => !value);
      },
    },
    {
      label: "Insert table",
      icon: Table2,
      run: () =>
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
      disabled: editor.isActive("table"),
    },
    {
      label: "Clear formatting",
      icon: RemoveFormatting,
      run: () => editor.chain().focus().unsetAllMarks().clearNodes().run(),
    },
  ];
  const applyLink = () => {
    if (!link.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setShowLink(false);
      return;
    }
    const href = safeEntryLink(link);
    if (!href) {
      setLinkError("Use a complete https://, http://, or mailto: link.");
      return;
    }
    if (editor.state.selection.empty && !editor.isActive("link")) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: href,
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setShowLink(false);
  };

  return (
    <div className="entry-composer" data-variant={variant} data-focused={focused || undefined}>
      <div
        role="toolbar"
        aria-label="Text formatting"
        className="entry-toolbar"
      >
        {showAllFormatting && <select
          aria-label="Text style"
          disabled={disabled}
          value={
            editor.isActive("heading")
              ? String(editor.getAttributes("heading").level)
              : "paragraph"
          }
          onChange={(event) => {
            const value = Number(event.target.value);
            if (value >= 1 && value <= 6)
              editor
                .chain()
                .focus()
                .toggleHeading({ level: value as 1 | 2 | 3 | 4 | 5 | 6 })
                .run();
            else editor.chain().focus().setParagraph().run();
          }}
        >
          <option value="paragraph">Paragraph</option>
          {[1, 2, 3, 4, 5, 6].map((level) => (
            <option key={level} value={level}>
              Heading {level}
            </option>
          ))}
        </select>}
        {actions.filter((action) => showAllFormatting || action.compact).map(
          ({ label, icon: Icon, active, run, disabled: unavailable }) => (
            <button
              key={label}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={active}
              disabled={disabled || unavailable}
              onMouseDown={(event) => event.preventDefault()}
              onClick={run}
            >
              <Icon size={17} aria-hidden="true" />
            </button>
          ),
        )}
        {compact && (
          <button
            type="button"
            title={moreFormatting ? "Less formatting" : "More formatting"}
            aria-label={moreFormatting ? "Less formatting" : "More formatting"}
            aria-expanded={moreFormatting}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setMoreFormatting((value) => !value)}
          >
            <SlidersHorizontal size={17} aria-hidden="true" />
          </button>
        )}
      </div>
      {showLink && (
        <div className="entry-link-panel">
          <label htmlFor={linkId}>Link URL</label>
          <input
            id={linkId}
            value={link}
            autoFocus
            placeholder="https://example.com"
            disabled={disabled}
            onChange={(event) => setLink(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyLink();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setShowLink(false);
                editor.commands.focus();
              }
            }}
          />
          <button type="button" disabled={disabled} onClick={applyLink}>
            Apply
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              setShowLink(false);
            }}
          >
            Remove
          </button>
          {linkError && <p role="alert">{linkError}</p>}
        </div>
      )}
      {editor.isActive("table") && (
        <div className="entry-table-tools" aria-label="Table tools">
          <button
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().addRowAfter().run()}
          >
            Add row
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            Add column
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().deleteRow().run()}
          >
            Delete row
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().deleteColumn().run()}
          >
            Delete column
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            Delete table
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
