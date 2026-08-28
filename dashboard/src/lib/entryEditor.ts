import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import Highlight from "@tiptap/extension-highlight";
import { safeEntryLink } from "./entryContent";

// Preserve FavLock's existing checklist HTML rather than storing editor-specific
// JSON or losing checkbox states when old documents are opened.
const EntryTaskList = TaskList.extend({
  parseHTML() {
    return [
      { tag: 'ul[data-checklist="true"]', priority: 60 },
      { tag: 'ul[data-type="taskList"]', priority: 60 },
    ];
  },
  renderHTML() {
    return ["ul", { "data-checklist": "true" }, 0];
  },
});

const EntryTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      checked: {
        default: false,
        keepOnSplit: false,
        parseHTML: (element) =>
          element.querySelector(
            ":scope > input[checked], :scope > label > input[checked]",
          ) !== null || element.getAttribute("data-checked") === "true",
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "li",
        priority: 60,
        getAttrs: (element) =>
          element.parentElement?.matches(
            'ul[data-checklist="true"], ul[data-type="taskList"]',
          )
            ? {}
            : false,
        contentElement: (element) => {
          const content =
            element.querySelector<HTMLDivElement>(":scope > div") ?? element;
          // The old contentEditable editor represented an empty item as <br>.
          // A hard-break node would prevent Enter from exiting that empty item.
          if (
            !content.textContent?.trim() &&
            Array.from(content.children).every((child) =>
              ["BR", "INPUT"].includes(child.tagName),
            )
          ) {
            return document.createElement("div");
          }
          return content;
        },
      },
    ];
  },
  renderHTML({ node }) {
    return [
      "li",
      {},
      [
        "input",
        { type: "checkbox", ...(node.attrs.checked ? { checked: "" } : {}) },
      ],
      ["div", 0],
    ];
  },
});

export function entryEditorExtensions() {
  return [
    StarterKit.configure({
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        isAllowedUri: (url) => safeEntryLink(url) !== null,
        HTMLAttributes: { target: null, rel: "noopener noreferrer" },
      },
    }),
    EntryTaskList,
    EntryTaskItem.configure({
      nested: true,
      a11y: { checkboxLabel: () => "Toggle checklist item" },
    }),
    TableKit.configure({ table: { resizable: false } }),
    Highlight,
  ];
}
