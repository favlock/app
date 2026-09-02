interface SocialAuthButtonProps {
  label: string;
  logoSrc: string;
  logoWidth: number;
  logoHeight: number;
  logoClassName: string;
  loading: boolean;
  loadingMessage: string;
  disabled: boolean;
  onClick: () => void;
}

export default function SocialAuthButton({
  label,
  logoSrc,
  logoWidth,
  logoHeight,
  logoClassName,
  loading,
  loadingMessage,
  disabled,
  onClick,
}: SocialAuthButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-busy={loading}
      className="relative flex h-11 w-full items-center justify-center rounded-lg border border-[#747775] bg-white text-sm/5 font-medium text-[#1f1f1f] transition-[background-color,box-shadow] hover:bg-[#f8fafd] hover:shadow-sm active:bg-[#eef2f7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="inline-grid grid-cols-[2.5rem_auto] items-center gap-1">
        <span className="flex size-10 items-center justify-center">
          <img
            src={logoSrc}
            alt=""
            width={logoWidth}
            height={logoHeight}
            draggable={false}
            className={`pointer-events-none shrink-0 select-none ${logoClassName}`}
          />
        </span>
        <span>{label}</span>
      </span>
      {loading && (
        <span role="status" className="sr-only">
          {loadingMessage}
        </span>
      )}
    </button>
  );
}
