import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EncryptionSetup from "./EncryptionSetup";
import { queryClient } from "../lib/queryClient";

const TEST_KEY = "1234 5678 9012 3456 7890 1234 5678 9012";

const { userMetadata, fetchAccountSettings, fetchEncryptionVerifier, setKeyRemembered, setRawKey, signOut, updateAccountProfile } =
  vi.hoisted(() => ({
    userMetadata: { current: { given_name: "Google", family_name: "User" } as Record<string, string> },
    fetchAccountSettings: vi.fn(),
    fetchEncryptionVerifier: vi.fn(),
    setKeyRemembered: vi.fn(),
    setRawKey: vi.fn(),
    signOut: vi.fn(),
    updateAccountProfile: vi.fn(),
  }));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({
    loading: false,
    session: { access_token: "current.jwt.token" },
    signOut,
    user: {
      id: "google-user",
      email: "google@example.com",
      created_at: "2026-07-20T10:00:00.000Z",
      last_sign_in_at: "2026-07-20T10:00:01.000Z",
      app_metadata: { provider: "google" },
      user_metadata: userMetadata.current,
    },
  }),
}));

vi.mock("../lib/accountSettingsApi", () => ({
  fetchAccountSettings,
  updateAccountProfile,
}));

vi.mock("../lib/encryptionMetadataApi", () => ({
  fetchEncryptionVerifier,
  fetchPasskeyEncryptionRecord: vi.fn(),
  savePasskeyEncryptionMetadata: vi.fn(),
}));

vi.mock("../context/useEncryption", () => ({
  useEncryption: () => ({
    keyLoading: false,
    setKeyRemembered,
    setRawKey,
  }),
}));

vi.mock("../lib/encryption", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/encryption")>()),
  generateEncryptionKey: () => TEST_KEY,
}));

vi.mock("./EncryptionKeyDialog", () => ({
  default: ({
    encryptionKey,
    onComplete,
  }: {
    encryptionKey: string | null;
    onComplete: () => void | Promise<void>;
  }) => (
    <div data-testid="encryption-key">
      {encryptionKey}
      {encryptionKey && (
        <button type="button" onClick={() => void onComplete()}>
          Complete setup
        </button>
      )}
    </div>
  ),
}));

describe("EncryptionSetup", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    userMetadata.current = { given_name: "Google", family_name: "User" };
    queryClient.clear();
    fetchAccountSettings.mockReset().mockResolvedValue({
      firstName: "Google",
      lastName: "User",
      defaultSearchEngine: null,
      bookmarkSearchShortcutsEnabled: null,
      themeVariant: "sunset",
      searchHistoryMode: "cloud",
    });
    fetchEncryptionVerifier.mockReset().mockResolvedValue(null);
    setKeyRemembered.mockReset().mockResolvedValue(undefined);
    setRawKey.mockReset().mockResolvedValue(undefined);
    signOut.mockReset().mockResolvedValue(undefined);
    updateAccountProfile.mockReset().mockResolvedValue({});
    sessionStorage.clear();
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("creates a user-info row and shows a generated key when the row is missing", async () => {
    fetchAccountSettings.mockResolvedValue(null);
    fetchEncryptionVerifier.mockResolvedValue(null);

    await act(async () => {
      root.render(
        <StrictMode>
          <EncryptionSetup />
        </StrictMode>,
      );
    });

    expect(container.textContent).toContain(TEST_KEY);
    expect(setRawKey).toHaveBeenCalledTimes(1);
    expect(setRawKey).toHaveBeenCalledWith(TEST_KEY);
    expect(updateAccountProfile).toHaveBeenCalledExactlyOnceWith(
      "current.jwt.token",
      { firstName: "Google", lastName: "User" },
    );
  });

  it("prepares a nameless account without inventing a profile or changing key setup", async () => {
    userMetadata.current = {};
    fetchAccountSettings.mockResolvedValue(null);
    await act(async () => root.render(<StrictMode><EncryptionSetup /></StrictMode>));
    expect(updateAccountProfile).toHaveBeenCalledExactlyOnceWith("current.jwt.token", { firstName: "", lastName: "" });
    expect(setRawKey).toHaveBeenCalledExactlyOnceWith(TEST_KEY);
    expect(container.textContent).toContain(TEST_KEY);
  });

  it("generates and saves a key when key_verifier is missing", async () => {
    fetchEncryptionVerifier.mockResolvedValue(null);

    await act(async () => {
      root.render(
        <StrictMode>
          <EncryptionSetup />
        </StrictMode>,
      );
    });

    expect(container.textContent).toContain(TEST_KEY);
    expect(setRawKey).toHaveBeenCalledWith(TEST_KEY);
    expect(updateAccountProfile).not.toHaveBeenCalled();
  });

  it("does not replace an existing encryption key", async () => {
    fetchEncryptionVerifier.mockResolvedValue("enc:existing-verifier");

    await act(async () => {
      root.render(
        <StrictMode>
          <EncryptionSetup />
        </StrictMode>,
      );
    });

    expect(container.textContent).toBe("");
    expect(setRawKey).not.toHaveBeenCalled();
    expect(updateAccountProfile).not.toHaveBeenCalled();
  });

  it("does not replay the setup dialog after setup is completed", async () => {
    fetchEncryptionVerifier.mockResolvedValue(null);

    await act(async () => {
      root.render(
        <StrictMode>
          <EncryptionSetup />
        </StrictMode>,
      );
    });

    expect(container.textContent).toContain(TEST_KEY);

    await act(async () => {
      container.querySelector("button")?.click();
    });

    expect(setKeyRemembered).toHaveBeenCalledWith(true);
    expect(container.textContent).not.toContain(TEST_KEY);

    // An auth refresh supplies a new user object for the same account.
    await act(async () => {
      root.render(
        <StrictMode>
          <EncryptionSetup />
        </StrictMode>,
      );
    });

    expect(container.textContent).not.toContain(TEST_KEY);
    expect(setRawKey).toHaveBeenCalledTimes(1);
  });

  it("shows the underlying setup failure so it can be fixed", async () => {
    fetchEncryptionVerifier.mockResolvedValue(null);
    setRawKey.mockRejectedValue(
      new Error("Could not save the encryption key verifier: permission denied"),
    );

    await act(async () => {
      root.render(
        <StrictMode>
          <EncryptionSetup />
        </StrictMode>,
      );
    });

    expect(document.body.textContent).toContain(
      "Could not save the encryption key verifier: permission denied",
    );
  });

  it("offers sign out when encryption cannot be prepared", async () => {
    fetchAccountSettings.mockResolvedValue(null);
    fetchEncryptionVerifier.mockResolvedValue(null);
    updateAccountProfile.mockRejectedValue(new Error("permission denied"));

    await act(async () => {
      root.render(
        <StrictMode>
          <EncryptionSetup />
        </StrictMode>,
      );
    });

    expect(document.body.textContent).toContain(
      "Could not prepare encryption for this account. Try again.",
    );
    const signOutButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Sign out"));

    await act(async () => {
      signOutButton!.click();
    });

    expect(signOut).toHaveBeenCalledOnce();
  });
});
