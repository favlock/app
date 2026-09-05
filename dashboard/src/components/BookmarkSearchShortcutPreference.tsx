import { useState } from "react";
import {
  useUpdateBookmarkSearchShortcuts,
  useUserInfo,
} from "../hooks/useUserInfoQuery";
import { Checkbox, CheckboxField } from "./ui/checkbox";
import { Description, Label } from "./ui/fieldset";

export default function BookmarkSearchShortcutPreference() {
  const { data: userInfo, isLoading } = useUserInfo();
  const updateShortcuts = useUpdateBookmarkSearchShortcuts();
  const [saveError, setSaveError] = useState<string | null>(null);
  const enabled = userInfo?.bookmark_search_shortcuts_enabled !== false;

  const setEnabled = async (nextEnabled: boolean) => {
    if (updateShortcuts.isPending) return;
    setSaveError(null);

    try {
      await updateShortcuts.mutateAsync(nextEnabled);
    } catch {
      setSaveError("Could not save this preference. Please try again.");
    }
  };

  return (
    <section>
      <div>
        <h3 className="text-sm font-semibold liquid-ink">
          Bookmark search shortcuts
        </h3>
        <p className="mt-1 text-sm liquid-muted">
          Choose whether numbered shortcuts appear while searching bookmarks.
        </p>
      </div>

      <CheckboxField className="mt-5">
        <Checkbox
          color="emerald"
          checked={enabled}
          onChange={(checked) => void setEnabled(checked)}
          disabled={isLoading || updateShortcuts.isPending}
        />
        <Label>Enable numbered bookmark shortcuts</Label>
        <Description>
          Show hints on the first nine bookmark matches and open them with
          Command or Control + 1–9. Changes save automatically.
        </Description>
      </CheckboxField>

      {saveError ? (
        <p
          className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300"
          role="alert"
        >
          {saveError}
        </p>
      ) : null}
    </section>
  );
}
