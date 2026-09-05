import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
const TURNSTILE_SCRIPT_ID = "cloudflare-turnstile-script";
const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  theme: "auto";
  size: "flexible";
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
}

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: TurnstileRenderOptions,
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileLoader: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }

  if (turnstileLoader) {
    return turnstileLoader;
  }

  turnstileLoader = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(
      TURNSTILE_SCRIPT_ID,
    ) as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement("script");

    const handleLoad = () => {
      if (window.turnstile) {
        resolve(window.turnstile);
      } else {
        reject(new Error("Cloudflare Turnstile did not initialize."));
      }
    };

    const handleError = () => {
      turnstileLoader = null;
      reject(new Error("Could not load Cloudflare Turnstile."));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existingScript) {
      script.id = TURNSTILE_SCRIPT_ID;
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return turnstileLoader;
}

export interface CloudflareTurnstileHandle {
  reset: () => void;
}

interface CloudflareTurnstileProps {
  action: string;
  onVerify: (token: string | null) => void;
}

const CloudflareTurnstile = forwardRef<
  CloudflareTurnstileHandle,
  CloudflareTurnstileProps
>(function CloudflareTurnstile({ action, onVerify }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const [loadError, setLoadError] = useState(false);
  const siteKey = (
    import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
  )?.trim();
  useEffect(() => {
    onVerifyRef.current = onVerify;
  }, [onVerify]);

  useImperativeHandle(ref, () => ({
    reset() {
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.reset(widgetIdRef.current);
      }
      onVerifyRef.current(null);
    },
  }), []);

  useEffect(() => {
    if (!siteKey || !containerRef.current) {
      return;
    }

    let cancelled = false;

    void loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme: "auto",
          size: "flexible",
          callback: (token) => {
            setLoadError(false);
            onVerifyRef.current(token);
          },
          "error-callback": () => {
            setLoadError(true);
            onVerifyRef.current(null);
          },
          "expired-callback": () => onVerifyRef.current(null),
          "timeout-callback": () => onVerifyRef.current(null),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          onVerifyRef.current(null);
        }
      });

    return () => {
      cancelled = true;
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [action, siteKey]);

  return (
    <div className="mt-5">
      <div
        ref={containerRef}
        className="min-h-[65px] w-full"
        aria-label="Security verification"
      />
      {!siteKey && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          Security verification is not configured.
        </p>
      )}
      {siteKey && loadError && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          Security verification could not load. Refresh the page and try again.
        </p>
      )}
    </div>
  );
});

export default CloudflareTurnstile;
