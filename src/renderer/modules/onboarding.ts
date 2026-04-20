import { activateFocusTrap, type FocusTrapController } from "./focusTrap";
const ONBOARDING_KEY = "quickbutton.onboardingSeen.v1";
const ONBOARDING_PROGRESS_KEY = "quickbutton.onboardingProgress.v1";
const ONBOARDING_PROGRESS_EVENT = "quickbutton:onboarding-progress";
const ONBOARDING_STEPS = ["contact", "button", "test-send"] as const;
type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
type OnboardingProgress = Record<OnboardingStep, boolean>;

function emptyProgress(): OnboardingProgress {
  return {
    contact: false,
    button: false,
    "test-send": false
  };
}

function readProgress(): OnboardingProgress {
  try {
    const raw = localStorage.getItem(ONBOARDING_PROGRESS_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw);
    return {
      contact: Boolean(parsed?.contact),
      button: Boolean(parsed?.button),
      "test-send": Boolean(parsed?.["test-send"])
    };
  } catch {
    return emptyProgress();
  }
}

function writeProgress(progress: OnboardingProgress): void {
  try {
    localStorage.setItem(ONBOARDING_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // ignore
  }
}

export function trackOnboardingStep(step: OnboardingStep): void {
  const progress = readProgress();
  if (progress[step]) return;
  progress[step] = true;
  writeProgress(progress);
  window.dispatchEvent(new CustomEvent(ONBOARDING_PROGRESS_EVENT, { detail: progress }));
}

export function setupOnboarding(): void {
  const overlay = document.getElementById("onboarding-overlay");
  const dismissBtn = document.getElementById("onboarding-dismiss");
  const checklistEl = document.getElementById("onboarding-checklist");
  const progressEl = document.getElementById("onboarding-progress");
  let focusTrap: FocusTrapController | null = null;

  const renderChecklist = (progress: OnboardingProgress): void => {
    if (checklistEl) {
      checklistEl.querySelectorAll("[data-step]").forEach((li) => {
        const step = li.getAttribute("data-step") as OnboardingStep | null;
        if (!step) return;
        const done = Boolean(progress[step]);
        li.classList.toggle("done", done);
        const marker = li.querySelector("[data-check]");
        if (marker) marker.textContent = done ? "✓" : "○";
      });
    }
    const doneCount = ONBOARDING_STEPS.filter((step) => progress[step]).length;
    if (progressEl) {
      progressEl.textContent = `${doneCount}/${ONBOARDING_STEPS.length} completed`;
    }
    if (dismissBtn) {
      dismissBtn.textContent = doneCount === ONBOARDING_STEPS.length ? "Finish" : "Got it";
    }
  };

  const hideOverlay = (): void => {
    focusTrap?.deactivate();
    focusTrap = null;
    overlay?.classList.add("hidden");
    try {
      localStorage.setItem(ONBOARDING_KEY, "1");
    } catch {
      // ignore
    }
  };

  const showOverlay = (): void => {
    if (!overlay || overlay.classList.contains("hidden") === false) {
      return;
    }
    overlay.classList.remove("hidden");
    focusTrap = activateFocusTrap(overlay as HTMLElement);
  };

  if (!overlay || !dismissBtn) {
    return;
  }

  renderChecklist(readProgress());

  dismissBtn.addEventListener("click", hideOverlay);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.classList.contains("hidden")) {
      event.preventDefault();
      hideOverlay();
    }
  });
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) {
      hideOverlay();
    }
  });
  window.addEventListener(ONBOARDING_PROGRESS_EVENT, () => {
    renderChecklist(readProgress());
  });

  let seen = false;
  try {
    seen = localStorage.getItem(ONBOARDING_KEY) === "1";
  } catch {
    // ignore
  }
  if (!seen) {
    showOverlay();
  }
}
