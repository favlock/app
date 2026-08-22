import { useEffect, useState, type ComponentType } from "react";
import {
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  FolderTree,
  Heart,
  Import,
  Inbox,
  Keyboard,
  LockKeyhole,
  Palette,
  Search,
  ShieldCheck,
  Sparkles,
  Tags,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Checkbox, CheckboxField } from "./ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { Description, Label } from "./ui/fieldset";
import {
  isOnboardingHidden,
  saveOnboardingPreference,
} from "../lib/onboarding";

interface Feature {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description: string;
}

interface OnboardingStep {
  eyebrow: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  features: Feature[];
}

const STEPS: OnboardingStep[] = [
  {
    eyebrow: "Welcome to FavLock",
    title: "Your bookmarks, finally in order",
    description:
      "Save the pages that matter, organize them your way, and find anything in seconds.",
    icon: Sparkles,
    features: [
      {
        icon: BookmarkPlus,
        title: "Save in a few clicks",
        description: "Add a link from the dashboard whenever you find something worth keeping.",
      },
      {
        icon: LockKeyhole,
        title: "Private by design",
        description: "Your bookmark details are encrypted before they leave your device.",
      },
      {
        icon: Search,
        title: "Ready when you need it",
        description: "Your local search index makes a large library feel instant.",
      },
    ],
  },
  {
    eyebrow: "Save & organize",
    title: "Build a library that makes sense to you",
    description:
      "Start with a link, then add just enough structure to make it easy to rediscover.",
    icon: FolderTree,
    features: [
      {
        icon: FolderTree,
        title: "Collections & subcollections",
        description: "Group related bookmarks and drag collections to reorder or nest them.",
      },
      {
        icon: Tags,
        title: "Tags across collections",
        description: "Add flexible labels when one bookmark belongs in more than one place.",
      },
      {
        icon: Import,
        title: "Bring your bookmarks with you",
        description: "Open Settings → Import to move in an existing browser bookmark file.",
      },
    ],
  },
  {
    eyebrow: "Find anything",
    title: "Jump straight to the link you want",
    description:
      "Browse your library or search titles, URLs, tags, and collections from one place.",
    icon: Search,
    features: [
      {
        icon: Keyboard,
        title: "Search from anywhere",
        description: "Press / on the dashboard to focus bookmark search.",
      },
      {
        icon: Heart,
        title: "Favorites & Unsorted",
        description: "Keep important links close and quickly review bookmarks that need filing.",
      },
      {
        icon: Inbox,
        title: "Your essential views",
        description: "Open Home, Notes, Favorites, and Unsorted from the top of Collections.",
      },
    ],
  },
  {
    eyebrow: "Make it yours",
    title: "Stay secure and in control",
    description:
      "FavLock gives you practical controls without getting in the way of your bookmarks.",
    icon: ShieldCheck,
    features: [
      {
        icon: ShieldCheck,
        title: "Keep your encryption key safe",
        description: "You need it to unlock encrypted bookmark data on a new device.",
      },
      {
        icon: Palette,
        title: "Choose your look",
        description: "Switch themes from the sidebar whenever you want a different mood.",
      },
      {
        icon: Check,
        title: "You’re ready",
        description: "Start by adding a bookmark, or import your existing collection in Settings.",
      },
    ],
  },
];

interface OnboardingDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function OnboardingDialog({
  open,
  onClose,
}: OnboardingDialogProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setDontShowAgain(isOnboardingHidden());
  }, [open]);

  const step = STEPS[stepIndex];
  const StepIcon = step.icon;
  const isLastStep = stepIndex === STEPS.length - 1;

  const dismiss = () => {
    saveOnboardingPreference(dontShowAgain);
    onClose();
  };

  const completeTour = () => {
    setDontShowAgain(true);
    saveOnboardingPreference(true);
    onClose();
  };

  return (
    <Dialog open={open} onClose={dismiss} size="2xl">
      <div className="relative">
        <button
          type="button"
          onClick={dismiss}
          className="theme-button-icon absolute -right-3 -top-3 inline-flex size-9"
          aria-label="Close onboarding"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        <div className="flex items-start gap-4 pr-10">
          <div className="flex size-12 flex-none items-center justify-center rounded-2xl bg-[color-mix(in_oklab,var(--app-primary)_14%,white)] text-[var(--app-primary)] ring-1 ring-[color-mix(in_oklab,var(--app-primary)_20%,transparent)]">
            <StepIcon className="size-6" aria-hidden={true} />
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-primary)]">
              {step.eyebrow}
            </p>
            <DialogTitle className="text-xl/7! sm:text-xl/7!">
              {step.title}
            </DialogTitle>
            <DialogDescription className="max-w-xl">
              {step.description}
            </DialogDescription>
          </div>
        </div>

        <DialogBody className="mt-7!">
          <div className="grid gap-3 sm:grid-cols-3">
            {step.features.map((feature) => {
              const FeatureIcon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_72%,white)] p-4"
                >
                  <div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--app-accent)_18%,white)] text-[var(--app-ink)]">
                    <FeatureIcon className="size-4.5" aria-hidden={true} />
                  </div>
                  <h3 className="text-sm font-bold text-[var(--app-ink)]">
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-5 text-[var(--app-muted)]">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-center gap-2" aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}>
            {STEPS.map((item, index) => (
              <button
                key={item.title}
                type="button"
                onClick={() => setStepIndex(index)}
                className={`h-2 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)] ${
                  index === stepIndex
                    ? "w-7 bg-[var(--app-primary)]"
                    : "w-2 bg-[color-mix(in_oklab,var(--app-line)_20%,transparent)] hover:bg-[color-mix(in_oklab,var(--app-primary)_45%,transparent)]"
                }`}
                aria-label={`Go to step ${index + 1}: ${item.title}`}
                aria-current={index === stepIndex ? "step" : undefined}
              />
            ))}
          </div>
        </DialogBody>

        <div className="mt-6 border-t border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] pt-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <CheckboxField>
              <Checkbox
                color="emerald"
                checked={dontShowAgain}
                onChange={setDontShowAgain}
              />
              <Label>Don’t show this again</Label>
              <Description>You can always reopen the tour from the sidebar.</Description>
            </CheckboxField>

            <div className="flex items-center justify-end gap-2">
              {stepIndex > 0 ? (
                <Button
                  type="button"
                  outline
                  onClick={() => setStepIndex((current) => current - 1)}
                >
                  <ChevronLeft data-slot="icon" aria-hidden="true" />
                  Back
                </Button>
              ) : (
                <Button type="button" plain onClick={dismiss}>
                  Skip tour
                </Button>
              )}
              <Button
                type="button"
                color="emerald"
                onClick={() => {
                  if (isLastStep) {
                    completeTour();
                  } else {
                    setStepIndex((current) => current + 1);
                  }
                }}
              >
                {isLastStep ? "Start bookmarking" : "Next"}
                {!isLastStep ? (
                  <ChevronRight data-slot="icon" aria-hidden="true" />
                ) : null}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
