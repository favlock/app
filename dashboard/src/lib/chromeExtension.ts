export function isGoogleChrome(userAgent: string, vendor: string): boolean {
  return (
    vendor === "Google Inc." &&
    /Chrome\//.test(userAgent) &&
    !/(?:Edg|OPR|Opera|SamsungBrowser)\//.test(userAgent)
  );
}

export function supportsFavLockChromeExtension(
  userAgent: string,
  vendor: string,
): boolean {
  return (
    isGoogleChrome(userAgent, vendor) &&
    !/(?:Android|Mobile|iPhone|iPad|iPod)\b/i.test(userAgent)
  );
}

export type ChromeExtensionOnboardingStatus =
  | "checking"
  | "not-installed"
  | "installed-unpaired"
  | "installed-wrong-account"
  | "installed-locked"
  | "paired";

type ExternalConnectionResponse = {
  ok?: boolean;
  connected?: boolean;
  unlocked?: boolean;
  accountMatches?: boolean | null;
};

type ChromeRuntime = {
  lastError?: { message?: string };
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (response?: ExternalConnectionResponse) => void,
  ) => void;
};

export async function checkChromeExtensionOnboardingStatus({
  extensionId,
  userId,
  timeoutMs = 1500,
}: {
  extensionId: string | undefined;
  userId: string;
  timeoutMs?: number;
}): Promise<ChromeExtensionOnboardingStatus> {
  if (!/^[a-p]{32}$/.test(extensionId ?? "") || !userId) {
    return "not-installed";
  }

  const runtime = (
    globalThis as typeof globalThis & {
      chrome?: { runtime?: ChromeRuntime };
    }
  ).chrome?.runtime;
  if (!runtime?.sendMessage) return "not-installed";

  return new Promise((resolve) => {
    let settled = false;
    const timeout = window.setTimeout(
      () => finish("not-installed"),
      timeoutMs,
    );
    function finish(status: ChromeExtensionOnboardingStatus) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(status);
    }

    try {
      runtime.sendMessage(
        extensionId!,
        { type: "favlock.extension.onboarding-status", userId },
        (response) => {
          if (runtime.lastError || !response?.ok) {
            finish("not-installed");
          } else if (!response.connected) {
            finish("installed-unpaired");
          } else if (response.accountMatches !== true) {
            finish("installed-wrong-account");
          } else if (!response.unlocked) {
            finish("installed-locked");
          } else {
            finish("paired");
          }
        },
      );
    } catch {
      finish("not-installed");
    }
  });
}
