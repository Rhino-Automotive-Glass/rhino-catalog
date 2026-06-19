"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Clipboard, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

type AdminErrorBoundaryProps = {
  areaLabel?: string;
  backHref?: string;
  backLabel?: string;
  error: Error & { digest?: string };
  reset: () => void;
};

const MAX_DETAIL_LENGTH = 12000;

function isChunkLoadError(error: Error) {
  const message = error.message.toLowerCase();
  return (
    error.name === "ChunkLoadError" ||
    message.includes("loading chunk") ||
    message.includes("failed to fetch dynamically imported module")
  );
}

function normalizeErrorValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === "bigint") return value.toString();

  return value;
}

function getExtraErrorFields(error: Error & { digest?: string }) {
  return Object.fromEntries(
    Object.entries(error)
      .filter(([key]) => !["name", "message", "stack", "digest"].includes(key))
      .map(([key, value]) => [key, normalizeErrorValue(value)])
  );
}

function getBrowserDiagnostics() {
  if (typeof document === "undefined" || typeof navigator === "undefined") {
    return undefined;
  }

  const htmlClasses = Array.from(document.documentElement.classList);
  const translatedPageClass = htmlClasses.find(
    (className) => className === "translated-ltr" || className === "translated-rtl"
  );
  const translatedTextNodeCount = document.querySelectorAll(
    'font[style*="vertical-align"], font[style*="background-color"]'
  ).length;
  const googleTranslateElementDetected = Boolean(
    document.querySelector(
      '.goog-te-banner-frame, .goog-te-menu-frame, [class*="goog-te-"], iframe[src*="translate.google"]'
    )
  );
  const adminRoot = document.querySelector<HTMLElement>("[data-admin-root]");

  return {
    userAgent: navigator.userAgent,
    languages: Array.from(navigator.languages ?? []),
    online: navigator.onLine,
    documentLanguage: document.documentElement.lang || null,
    documentTranslate: document.documentElement.getAttribute("translate"),
    adminTranslationProtection: {
      present: Boolean(adminRoot),
      translate: adminRoot?.getAttribute("translate") ?? null,
      notranslateClass: adminRoot?.classList.contains("notranslate") ?? false,
    },
    htmlClasses,
    translation: {
      detected: Boolean(
        translatedPageClass ||
          googleTranslateElementDetected ||
          translatedTextNodeCount > 0
      ),
      translatedPageClass: translatedPageClass ?? null,
      googleTranslateElementDetected,
      translatedTextNodeCount,
    },
  };
}

function getErrorDetails(
  error: Error & { digest?: string },
  areaLabel: string,
  browser = getBrowserDiagnostics()
) {
  const details = {
    timestamp: new Date().toISOString(),
    path: typeof window === "undefined" ? undefined : window.location.href,
    area: areaLabel,
    name: error.name || "Error",
    message: error.message || "No error message was provided.",
    digest: error.digest,
    extra: getExtraErrorFields(error),
    browser,
    stack: error.stack,
  };

  const serialized = JSON.stringify(details, null, 2);

  if (serialized.length <= MAX_DETAIL_LENGTH) {
    return serialized;
  }

  return `${serialized.slice(0, MAX_DETAIL_LENGTH)}\n...truncated`;
}

async function copyText(value: string) {
  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, textArea.value.length);

  try {
    const copied = document.execCommand("copy");
    if (copied) return;
  } finally {
    textArea.remove();
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  throw new Error("Browser rejected the copy command");
}

export function AdminErrorBoundary({
  areaLabel = "Admin",
  backHref = "/admin/products",
  backLabel = "Back to admin",
  error,
  reset,
}: AdminErrorBoundaryProps) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [errorDetails, setErrorDetails] = useState(() => getErrorDetails(error, areaLabel));
  const [translationDetected, setTranslationDetected] = useState(false);
  const reloadRecommended = isChunkLoadError(error);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      const browserDiagnostics = getBrowserDiagnostics();
      setErrorDetails(getErrorDetails(error, areaLabel, browserDiagnostics));
      setTranslationDetected(browserDiagnostics?.translation.detected ?? false);
    });

    console.error(`${areaLabel} route failed to render`, {
      digest: error.digest,
      message: error.message,
      name: error.name,
      stack: error.stack,
    });

    return () => {
      cancelled = true;
    };
  }, [areaLabel, error]);

  async function handleCopyDetails() {
    try {
      await copyText(errorDetails);
      setCopyStatus("copied");
    } catch (copyError) {
      console.error("Failed to copy admin error details", copyError);
      setCopyStatus("failed");
    }
  }

  return (
    <div
      className="notranslate mx-auto flex min-h-[60vh] max-w-4xl items-center justify-center px-4"
      translate="no"
    >
      <div className="card w-full p-6 sm:p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-center text-xl font-semibold text-foreground">
          {areaLabel} page could not load
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted-foreground">
          {translationDetected
            ? "Browser translation was detected and may have changed the page structure. Disable translation for this site, then refresh the page."
            : reloadRecommended
            ? "This looks like an outdated browser bundle after a deployment. Refreshing the page should load the latest admin code."
            : "Something failed while rendering this page. The technical details below can be shared for debugging."}
        </p>
        {error.digest && (
          <p className="mt-3 text-center font-mono text-xs text-muted-foreground">
            Error digest: {error.digest}
          </p>
        )}
        <details
          open
          className="mt-6 rounded-md border border-red-200 bg-red-50 text-left dark:border-red-900/60 dark:bg-red-950/30"
        >
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-red-900 dark:text-red-200">
            Technical details
          </summary>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-red-200 px-4 py-3 font-mono text-xs leading-relaxed text-red-950 dark:border-red-900/60 dark:text-red-100">
            {errorDetails}
          </pre>
        </details>
        <div className="mt-3 flex flex-col items-center gap-2">
          <Button type="button" variant="outline" onClick={handleCopyDetails}>
            {copyStatus === "copied" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Clipboard className="h-4 w-4" />
            )}
            {copyStatus === "copied" ? "Technical details copied" : "Copy technical details"}
          </Button>
          {copyStatus === "failed" && (
            <p role="status" className="text-xs text-destructive">
              Copy failed. Select the technical details manually.
            </p>
          )}
        </div>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button type="button" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" />
            Refresh page
          </Button>
          <Button type="button" variant="outline" onClick={reset}>
            Try again
          </Button>
          <Button asChild variant="ghost">
            <Link href={backHref}>{backLabel}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
