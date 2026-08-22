import { PRODUCT_VERSION } from "@favlock/shared";

export interface Release {
  version: string;
  date: string;
  changes: string[];
}

export const changelog: Release[] = [
  {
    version: PRODUCT_VERSION,
    date: "August 22, 2026",
    changes: [
      "BookLock is now FavLock, with a new secure home at vault.favlock.app.",
    ],
  },
  {
    version: "1.3.2",
    date: "August 21, 2026",
    changes: [
      "View, copy, or share your encryption key with a private QR code from Security & privacy settings.",
    ],
  },
  {
    version: "1.3.1",
    date: "August 18, 2026",
    changes: [
      "Change or add your account password from Security & privacy settings.",
    ],
  },
  {
    version: "1.3.0",
    date: "August 18, 2026",
    changes: [
      "Sign in or create a FavLock account with email and password, alongside Google.",
      "Create a stronger password with clear, real-time strength guidance.",
      "Connect and unlock the Chrome extension using email, a saved passkey, or your recovery key.",
    ],
  },
  {
    version: "1.2.0",
    date: "August 17, 2026",
    changes: [
      "Create ordered Lists for videos and articles, add saved bookmarks manually, and manage List membership while editing.",
      "Save pages and organize them with collections, tags, and Lists directly from the FavLock extension.",
      "Reliability improvements for organizing and syncing your library.",
      "Free accounts can create up to three Lists, with unlimited Lists included in Pro.",
    ],
  },
  {
    version: "1.1.2",
    date: "August 15, 2026",
    changes: [
      "Security and reliability improvements across FavLock.",
    ],
  },
  {
    version: "1.1.1",
    date: "August 15, 2026",
    changes: [
      "Faster bookmark search with numbered shortcuts for the first nine matches and a saved preference to turn them off.",
    ],
  },
  {
    version: "1.1.0",
    date: "August 14, 2026",
    changes: [
      "A clearer, more consistent Tasks experience across FavLock.",
      "Simpler sign-in, account creation, and Pro upgrade flows.",
      "A more polished mobile experience with improved navigation and search.",
      "Reliability improvements throughout the app and encrypted library.",
    ],
  },
  {
    version: "1.0.0",
    date: "August 11, 2026",
    changes: [
      "FavLock 1.0 brings bookmarks, notes, tasks, and saved articles together in one private, encrypted library.",
      "Search titles, links, collections, and tags locally, with full-content search for notes, tasks, and saved articles on Pro.",
      "Create formatted notes and focused tasks with optional due dates, date-based views, and undoable completion.",
      "Save encrypted article snapshots from the Chrome extension and read them in a distraction-free Reading view.",
      "Organize every item with unlimited collections and tags, then recover accidental deletions from Trash.",
      "Import browser bookmarks with duplicate review, or export a portable FavLock JSON archive and browser-compatible bookmark HTML.",
      "Choose Free for up to 500 bookmarks, 50 notes and tasks, and 25 saved articles, or Pro for expanded limits, full-content search, and 30-day Trash recovery.",
    ],
  },
];
