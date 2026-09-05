import { useState } from "react";
import { DASHBOARD_HOME_URL } from "../lib/appUrls";
import { favLockAuth } from "../lib/favLockAuth";
import { APPLE_LOGO_BUTTON_ARTWORK } from "./providerAuthArtwork";
import SocialAuthButton from "./SocialAuthButton";

interface AppleAuthButtonProps {
  onError: (message: string | null) => void;
  disabled?: boolean;
  redirectTo?: string;
}

export default function AppleAuthButton({
  onError,
  disabled = false,
  redirectTo = DASHBOARD_HOME_URL,
}: AppleAuthButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleAppleAuth = async () => {
    onError(null);
    setLoading(true);

    try {
      const { error } = await favLockAuth.signInWithOAuth({
        provider: "apple",
        options: { redirectTo },
      });

      if (error) {
        onError(error.message);
        setLoading(false);
      }
    } catch {
      onError("Could not connect to Apple. Please try again.");
      setLoading(false);
    }
  };

  return (
    <SocialAuthButton
      label="Continue with Apple"
      logoSrc={APPLE_LOGO_BUTTON_ARTWORK}
      logoWidth={40}
      logoHeight={40}
      logoClassName="size-10 translate-y-0.5 mix-blend-multiply"
      loading={loading}
      loadingMessage="Redirecting to Apple..."
      disabled={loading || disabled}
      onClick={handleAppleAuth}
    />
  );
}
