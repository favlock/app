# FavLock for Firefox — AMO listing draft

Copy the text under each field into the corresponding Mozilla Add-ons form.
The Name and Summary describe the Firefox build's supported features. Check the
production pairing flow with a real account before submitting the listing.

## Name

FavLock – Save, Search & Organize Bookmarks

## Summary

Save, search, and organize bookmarks in Firefox with encrypted titles and URLs. Add Collections, tags, tab sessions, and article snapshots.

## Description

**Save, search, and organize bookmarks in Firefox.** FavLock encrypts protected
titles and URLs before storing or syncing them. From the toolbar, add pages to
Collections, tags, and Lists, save tab sessions, and capture articles and
highlights.

Open the extension to see whether the current page is already saved. Add it to a
Collection, choose tags or Lists, or update an existing bookmark instead of
making a duplicate. Switch to Search to find saved bookmarks by title, URL,
Collection, or tag. Search runs in the extension after your library is unlocked.

**What you can do**

- **Save tabs:** Keep all open tabs together as a session.
- **Import bookmarks:** Preview Firefox bookmarks and check for duplicates.
- **Read later:** Open supported articles in a focused Reader view and save
  encrypted article snapshots to Readspace.
- **Keep highlights:** Save selected text as an encrypted highlight and restore
  saved highlights on websites you approve.
- **Choose your new tab:** Optionally open FavLock in new tabs.

**Privacy:** FavLock encrypts protected bookmark titles and URLs, Collection,
tag, and List names, and saved article content before storing or syncing them.
Account and session information, relationships, and operational metadata are still visible
to the service. The extension uses page information when you save a bookmark,
article content when you choose Reader, and selected text when you choose to
save a highlight.

**Firefox permissions:** Firefox asks for access to your bookmarks when you
start an import and for website access when you enable highlights on a site. You can turn webpage
highlights off in extension settings. A FavLock account and an unlocked library
are required to save and sync content. The Free plan includes the core bookmark
features with usage limits; an optional paid Pro subscription raises limits and
unlocks additional features.

## Version notes, if requested

Initial Firefox release: save and search bookmarks, organize them with
Collections, tags, and Lists, import Firefox bookmarks, save tab sessions, read
and capture articles, and save website highlights.

## Submission reminders

- Leave **experimental** unchecked for a verified public release. If this is
  intentionally a beta, check it and say so in the listing. Do not submit until
  production pairing and saving work.
- Check **requires payment / non-free services** because Pro unlocks additional
  functionality; the core bookmark features remain available on the Free plan.
- Select **Bookmarks** as the category.
- Use `support@favlock.app`, `https://favlock.app`, and **MIT License**, which
  matches this repository's license.
- Select Firefox Desktop only. Firefox for Android has not been validated.
- Add the current FavLock privacy policy URL to the separate AMO privacy-policy
  field. This extension sends account and encrypted library data to FavLock.
- Give reviewers a dedicated working test account and pairing instructions in
  AMO's private reviewer-notes field. Do not put credentials in this document.
- Verify production pairing and saving before submission; the development build
  uses different dashboard and API URLs.
