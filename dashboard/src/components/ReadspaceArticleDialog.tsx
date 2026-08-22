import { ExternalLink, FolderIcon, Tag } from "lucide-react";
import type { ReadspaceContent } from "../lib/readspaceContent";
import type { ReadspaceEntry } from "../types/bookmark";
import { Button } from "./ui/button";
import { Dialog, DialogActions, DialogTitle } from "./ui/dialog";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function sourceDates(content: ReadspaceContent) {
  const published = content.publishedAt
    ? dateFormatter.format(new Date(content.publishedAt))
    : "";
  const updated = content.updatedAt
    ? dateFormatter.format(new Date(content.updatedAt))
    : "";
  return [
    published ? `Published ${published}` : "",
    updated && updated !== published ? `Updated ${updated}` : "",
  ].filter(Boolean);
}

export default function ReadspaceArticleDialog({
  article,
  onClose,
}: {
  article: { entry: ReadspaceEntry; content: ReadspaceContent } | null;
  onClose: () => void;
}) {
  const metadata = article
    ? [
        article.content.siteName,
        article.content.byline,
        ...sourceDates(article.content),
      ].filter(Boolean)
    : [];

  return (
    <Dialog
      open={!!article}
      onClose={onClose}
      size="4xl"
      className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-h-[calc(100vh-4rem)]"
    >
      {article ? (
        <>
          <div className="mx-auto max-w-3xl">
            <DialogTitle>
              <span className="block font-serif text-3xl leading-tight tracking-tight text-zinc-950 sm:text-5xl">
                {article.entry.title}
              </span>
            </DialogTitle>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-zinc-600">
              {metadata.map((item, index) => (
                <span key={`${item}-${index}`} className="inline-flex items-center gap-2">
                  {index > 0 ? <span className="text-zinc-300">•</span> : null}
                  <span>{item}</span>
                </span>
              ))}
              <span className="inline-flex items-center gap-2">
                {metadata.length > 0 ? <span className="text-zinc-300">•</span> : null}
                <a
                  href={article.content.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 font-semibold text-[#0f766e] hover:underline"
                >
                  Original <ExternalLink size={13} aria-hidden="true" />
                </a>
              </span>
            </div>
            {article.entry.folder || article.entry.tags?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-medium text-zinc-600">
                {article.entry.folder ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-950/6 px-2.5 py-1">
                    <FolderIcon size={12} aria-hidden="true" />
                    {article.entry.folder.name}
                  </span>
                ) : null}
                {article.entry.tags?.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 rounded-full bg-violet-500/8 px-2.5 py-1 text-violet-700"
                  >
                    <Tag size={11} aria-hidden="true" />#{tag.name}
                  </span>
                ))}
              </div>
            ) : null}

            {article.content.html ? (
              <article
                className="select-text py-7 font-serif text-[18px] leading-[1.72] text-zinc-800 sm:text-[19px] [&_a]:font-medium [&_a]:text-[#0f766e] [&_a]:underline [&_a]:decoration-[#0f766e]/35 [&_a]:underline-offset-3 [&_code]:rounded [&_code]:bg-zinc-950/6 [&_code]:px-1 [&_h1]:mb-3 [&_h1]:mt-10 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-tight [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:leading-tight [&_h3]:mb-2 [&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-bold [&_h4]:mb-2 [&_h4]:mt-7 [&_h4]:font-bold [&_li]:my-1.5 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-7 [&_p]:my-5 [&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-7"
                dangerouslySetInnerHTML={{ __html: article.content.html }}
              />
            ) : (
              <div className="my-8 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                This older Readspace entry contains only its source details. Open
                the original article to read it.
              </div>
            )}
          </div>

          <DialogActions className="mx-auto max-w-3xl border-t border-zinc-950/10 pt-5">
            <Button type="button" outline onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </>
      ) : null}
    </Dialog>
  );
}
