import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "../components/ui/auth-layout";
import { Heading } from "../components/ui/heading";
import { Text } from "../components/ui/text";
import { useAuth } from "../context/useAuth";
import { createProCheckout } from "../lib/checkoutApi";
import { favLockAuth } from "../lib/favLockAuth";

export default function ProCheckout() {
  const { user, session } = useAuth();
  const checkout = useRef<Promise<string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    checkout.current ??= createProCheckout(session?.access_token ?? "", crypto.randomUUID());
    void checkout.current.then((url) => {
      if (active && favLockAuth.getLocalUser()?.id === user.id) window.location.assign(url);
    }).catch((checkoutError: unknown) => {
      if (!active) return;
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Could not open checkout. Please try again.",
      );
    });
    return () => { active = false; };
  }, [user, session?.access_token]);

  return (
    <AuthLayout>
      <div className="w-full text-center">
        <Heading>{error ? "Checkout unavailable" : "Opening checkout"}</Heading>
        <Text className="mt-2">
          {error ?? "Taking you to secure Pro checkout..."}
        </Text>
        {error ? (
          <Link
            to="/settings"
            className="mt-5 inline-block font-medium text-emerald-700 hover:underline"
          >
            Back to settings
          </Link>
        ) : null}
      </div>
    </AuthLayout>
  );
}
