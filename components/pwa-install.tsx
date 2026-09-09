"use client";

import { useEffect, useState } from "react";
import { Download, Share2, X } from "lucide-react";

type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

const DISMISSAL_KEY = "trios-pwa-install-dismissed-until-v1";
const DISMISSAL_WINDOW = 14 * 24 * 60 * 60 * 1000;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function isAppleHandheld() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isHandheld() {
  const touch = navigator.maxTouchPoints > 0;
  const coarsePointer = window.matchMedia("(any-pointer: coarse)").matches;
  const compactScreen = Math.min(window.screen.width, window.screen.height) <= 1366;
  return coarsePointer || (touch && compactScreen);
}

function installSuggestionWasDismissed() {
  try {
    return Number(window.localStorage.getItem(DISMISSAL_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(DISMISSAL_KEY, String(Date.now() + DISMISSAL_WINDOW));
  } catch {
    // The install suggestion remains dismissible for this page when storage is unavailable.
  }
}

export function PwaInstall() {
  const [platform, setPlatform] = useState<"chromium" | "apple" | "manual" | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    let registration: ServiceWorkerRegistration | undefined;
    let appleTimer: number | undefined;
    let manualTimer: number | undefined;
    let cancelled = false;

    if (
      process.env.NODE_ENV === "production" &&
      window.isSecureContext &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((result) => {
          registration = result;
          if (!cancelled) void result.update().catch(() => undefined);
        })
        .catch(() => undefined);
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void registration?.update().catch(() => undefined);
      }
    };
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (isStandalone() || !isHandheld() || installSuggestionWasDismissed()) return;
      setInstallPrompt(event as InstallPromptEvent);
      setPlatform("chromium");
    };
    const onInstalled = () => {
      if (appleTimer !== undefined) window.clearTimeout(appleTimer);
      if (manualTimer !== undefined) window.clearTimeout(manualTimer);
      setInstallPrompt(null);
      setPlatform(null);
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (
      !isStandalone() &&
      isHandheld() &&
      !installSuggestionWasDismissed()
    ) {
      if (isAppleHandheld()) {
        appleTimer = window.setTimeout(() => setPlatform("apple"), 6000);
      } else {
        manualTimer = window.setTimeout(
          () => {
            if (!isStandalone() && !installSuggestionWasDismissed()) {
              setPlatform((current) => current || "manual");
            }
          },
          35000,
        );
      }
    }

    return () => {
      cancelled = true;
      if (appleTimer !== undefined) window.clearTimeout(appleTimer);
      if (manualTimer !== undefined) window.clearTimeout(manualTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    rememberDismissal();
    setPlatform(null);
  };

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "dismissed") rememberDismissal();
    setPlatform(null);
  };

  if (!platform) return null;

  return (
    <aside
      className="pwa-install-card"
      aria-label="Install Trios on this device"
      aria-live="polite"
    >
      <span className="pwa-install-icon" aria-hidden="true">
        {platform === "apple" ? <Share2 size={23} /> : <Download size={23} />}
      </span>
      <div className="pwa-install-copy">
        <span className="pwa-install-eyebrow">TRIOS ON YOUR DEVICE</span>
        <strong>Keep property care close.</strong>
        {platform === "apple" ? (
          <p>
            Tap <b>Share</b>, then <b>Add to Home Screen</b> to open Trios like an app.
          </p>
        ) : platform === "manual" ? (
          <p>
            Open your browser menu, then choose <b>Install app</b> or <b>Add to Home screen</b>.
          </p>
        ) : (
          <p>Install Trios for quick, full-screen access on this phone or tablet.</p>
        )}
        {platform === "chromium" && (
          <button className="pwa-install-action" type="button" onClick={install}>
            <Download size={18} aria-hidden="true" /> Install Trios
          </button>
        )}
      </div>
      <button
        className="pwa-install-close"
        type="button"
        onClick={dismiss}
        aria-label="Hide install suggestion"
      >
        <X size={19} aria-hidden="true" />
      </button>
    </aside>
  );
}
