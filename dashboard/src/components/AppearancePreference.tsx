import { useId, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { getAppearance, setAppearance, subscribeAppearance } from "../lib/appearance";

const options = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "auto", label: "Auto", Icon: Monitor },
] as const;

export default function AppearancePreference() {
  const appearance = useSyncExternalStore(subscribeAppearance, getAppearance);
  const id = useId();

  return (
    <fieldset className="mb-6 border-b border-[var(--app-mint-border)] pb-6" aria-describedby={`${id}-description`}>
      <legend className="text-sm font-semibold liquid-ink">Appearance</legend>
      <p id={`${id}-description`} className="mt-1 text-sm liquid-muted">
        Choose a look for this browser. Auto follows your device.
      </p>
      <div className="appearance-control mt-4">
        {options.map(({ value, label, Icon }) => (
          <label key={value} className="appearance-option">
            <input
              type="radio"
              name={id}
              value={value}
              checked={appearance === value}
              onChange={() => setAppearance(value)}
              className="sr-only"
            />
            <span><Icon size={16} aria-hidden="true" />{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
