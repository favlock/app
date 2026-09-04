import { useState } from "react";
import { DASHBOARD_HOME_URL } from "../lib/appUrls";
import { favLockAuth } from "../lib/favLockAuth";
import { GOOGLE_G_ARTWORK } from "./providerAuthArtwork";
import SocialAuthButton from "./SocialAuthButton";

interface GoogleAuthButtonProps {
  onError: (message: string | null) => void;
  disabled?: boolean;
  redirectTo?: string;
}

export default function GoogleAuthButton({
  onError,
  disabled = false,
  redirectTo = DASHBOARD_HOME_URL,
}: GoogleAuthButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleGoogleAuth = async () => {
    onError(null);
    setLoading(true);

    try {
      const { error } = await favLockAuth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (error) {
        onError(error.message);
        setLoading(false);
      }
    } catch {
      onError("Could not connect to Google. Please try again.");
      setLoading(false);
    }
  };

  return (
    <SocialAuthButton
      label="Continue with Google"
      logoSrc={GOOGLE_G_ARTWORK}
      logoWidth={20}
      logoHeight={20}
      logoClassName="h-5 w-auto"
      loading={loading}
      loadingMessage="Redirecting to Google..."
      disabled={loading || disabled}
      onClick={handleGoogleAuth}
    />
  );
}
