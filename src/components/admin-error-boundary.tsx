"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

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

function getErrorDetails(error: Error & { digest?: string }, areaLabel: string) {
  const details = {
    timestamp: new Date().toISOString(),
    path: typeof window === "undefined" ? undefined : window.location.href,
    area: areaLabel,
    name: error.name || "Error",
    message: error.message || "No error message was provided.",
    digest: error.digest,
    extra: getExtraErrorFields(error),
    stack: error.stack,
  };

  const serialized = JSON.stringify(details, null, 2);

  if (serialized.length <= MAX_DETAIL_LENGTH) {
    return serialized;
  }

  return `${serialized.slice(0, MAX_DETAIL_LENGTH)}\n...truncated`;
}

export function AdminErrorBoundary({
  areaLabel = "Admin",
  backHref = "/admin/products",
  backLabel = "Back to admin",
  error,
  reset,
}: AdminErrorBoundaryProps) {
  const reloadRecommended = isChunkLoadError(error);

  useEffect(() => {
    console.error(`${areaLabel} route failed to render`, {
      digest: error.digest,
      message: error.message,
      name: error.name,
      stack: error.stack,
    });
  }, [areaLabel, error]);

  const errorDetails = getErrorDetails(error, areaLabel);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-4xl items-center justify-center px-4">
      <div className="card w-full p-6 sm:p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-center text-xl font-semibold text-foreground">
          {areaLabel} page could not load
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted-foreground">
          {reloadRecommended
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
