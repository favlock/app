# Writing editor

The dashboard's **Write** section uses Tiptap's MIT-licensed editor for documents
and task details. Individual items are called documents; tasks keep their name.
The section lives at `/write`. Legacy `/notes` links redirect with replacement
history, preserving query parameters, fragments, and navigation state.
Internal `note`/`notes` types, query keys, draft identifiers, encrypted content,
API payloads, and archive fields remain unchanged. Existing titles are not renamed.

No Tiptap Cloud account, paid extension, or remote document processor is used.
Third-party license notices ship at `/licenses/writing-editor.txt`.

## Scope

- Task details use the shared editor's compact variant: a smaller document area
  that grows with its content, with bold, italic, links, lists, checklists, and
  undo/redo in the initial toolbar. More formatting reveals the remaining tools
  without recreating the editor. The full schema stays enabled so existing and
  pasted headings, tables, quotes, and other supported formatting are preserved.
  Write retains its full toolbar. Both variants retain Focus and Full width.
  Plain-text fields and Support messages are unchanged.
- Rich text: headings, emphasis, underline, strike, highlight, safe links,
  ordered/unordered/check lists, quotes, code, and simple tables.
- Supported HTML formatting is retained on paste; common inline styles become
  semantic markup. Arbitrary CSS, scripts, embeds, images and attachments are
  not retained. Exact Word/Google Docs layout fidelity is not guaranteed.
- Normal selection copy uses the editor's HTML clipboard serialization.
  Explicit copy actions provide HTML plus plain text, or plain text alone.
  Clipboard permissions and browser support can require keyboard copying.
- One Focus control fills the viewport and
  hides collection/tag metadata and copy actions. Escape exits focus before
  closing the editor. Switching modes does not recreate the editor.
- Full width sits beside Focus for wider tables, code, and checklists.
  Comfortable width is the default for each editing session. Width works
  independently of Focus: outside Focus the dialog widens but keeps its outer
  margins and metadata; inside Focus the document uses the available width.
  Switching width preserves content, selection, undo history, and save state.
- Save (button or Cmd/Ctrl+S) keeps the editor open. First creation remains
  explicit; existing documents autosave after a 1.5-second pause. Requests are
  serialized and typing stays enabled while a save is in flight. Only the
  submitted snapshot becomes the saved baseline.
- Local draft content and metadata fields are encrypted with the existing vault
  key before IndexedDB persistence, 300 ms after an edit. The footer distinguishes
  an account save from "Saved on this device". Closing flushes the latest draft;
  if persistence fails, confirmation is required to discard unsaved changes.
- Reopening the same document (or New document/task for an uncreated draft) offers
  recovery. Restoration requires review and a manual Save before autosave resumes.
  Multiple editing sessions have separate draft slots, shown newest first.
  Recovery never silently replaces the account version.

## Draft recovery and autosave boundaries

Drafts live in a separate `favlock-writing-drafts` IndexedDB database, not in the
reconstructable library cache. Protected fields are inside an encrypted,
versioned envelope; account/document IDs, kind, timestamp and session ID remain
operational metadata. Strict decryption, account/document binding checks, size
limits and HTML sanitization run before recovery. Unreadable records are retained
and reported, not treated as plaintext or silently deleted.

Signing out or switching accounts deletes that account's drafts. An IndexedDB
generation check prevents pending writers in any tab from resurrecting them
after cleanup. Locking unmounts the plaintext editor and cancels queued work;
already encrypted drafts remain recoverable with the same key. Unsaved edits
inside the debounce window are not guaranteed after a crash or sudden lock.
The browser's unload warning is best effort, especially on mobile.

Local recovery is limited to 50 draft sessions per account and 128 KiB of serialized
plaintext per draft. It never silently evicts another draft to make room. These
are browser storage safeguards, not new Free/Pro entitlements. Browser storage
can be cleared or evicted; local drafts are not a backup.

Offline edits remain local. While the editor stays open, existing documents
resume autosave when the browser reports connectivity. A failed request pauses
autosave until manual retry; there is no background sync after closing. New tag
names require manual Save, and autosave waits until library sync supplies their
IDs, avoiding repeated creation of opaque encrypted tags.

The current API has no idempotent create or conditional revision write. Therefore
new documents are never automatically created/retried. After an ambiguous manual
create failure, check the library before retrying to avoid duplicates. A newer
account version observed in the editor pauses autosave and requires confirmation
before replacement, but this is not atomic conflict detection: simultaneous
cross-device writes can still race. Recovered drafts may be older than cloud data.

## Storage and compatibility

Protected title and HTML content still use the existing client encryption helper
and entry APIs. There is no database migration, API contract change, Markdown
conversion, bulk rewrite, or product version change in this step.

The shared sanitizer is used by entry decryption, incremental sync, previews,
and archive validation. It accepts the new semantic formatting while retaining
safe legacy markup. Checklists continue to use `ul[data-checklist="true"]`
and checkbox inputs; their content may be wrapped in paragraphs/divs by Tiptap.
Existing checklist states and empty-item Enter behavior are covered by tests.

The existing 10,000-character body limit, 120-character title limit, and combined
note/task quotas are unchanged. Client validation also measures the entire
serialized encrypted note/task request against the API's existing 64 KiB cap.
This is an early UX check, not a replacement for server validation. Readspace
write behavior is unchanged.

**Rollout limitation:** older dashboard builds sanitize away headings, links,
tables, highlights and code structure. Editing or importing a newly formatted
note through an older build can therefore lose that formatting. Deploy the
updated dashboard coherently and have users reload older open sessions before
editing rich documents. Merely keeping the HTML envelope does not make old
clients understand new formatting. Enforced minimum-client-version protection
would require a separate compatibility design; it is not supplied here.

## Verification

Regression tests cover legacy documents/checklists, formatting toggles and undo,
formatted paste and sanitization, clipboard representations and permission errors,
focus and width state, query-refresh draft preservation, repeated saves, manual save failures,
character limits, and encrypted request-size rejection before network calls.
Draft tests also cover ciphertext-only persistence, strict recovery, account
isolation and cleanup, stale writers, failed storage, offline/reconnect behavior,
edits during saves, paused retries, recovery review, locking, and account changes.

Browser QA uses fictional local data and the actual editor component. It does
not replace authenticated production sync testing, real-device mobile testing,
or checking native Word/Google Docs clipboard behavior in Safari and Firefox.
