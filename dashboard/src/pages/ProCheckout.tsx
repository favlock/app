import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "../components/ui/auth-layout";
import { Heading } from "../components/ui/heading";
import { Text } from "../components/ui/text";
import { useAuth } from "../context/useAuth";
import { CREEM_PRO_PRODUCT_URL } from "../lib/appUrls";
import { buildCreemCheckoutUrl } from "../lib/creemBilling";

export default function ProCheckout() {
  const { user } = useAuth();
  const redirectStarted = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || redirectStarted.current) return;
    redirectStarted.current = true;

    try {
      window.location.assign(
        buildCreemCheckoutUrl(CREEM_PRO_PRODUCT_URL, user.id),
      );
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Could not open checkout. Please try again.",
      );
    }
  }, [user]);

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
