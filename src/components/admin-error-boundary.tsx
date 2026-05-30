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

function isChunkLoadError(error: Error) {
  const message = error.message.toLowerCase();
  return (
    error.name === "ChunkLoadError" ||
    message.includes("loading chunk") ||
    message.includes("failed to fetch dynamically imported module")
  );
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

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center px-4">
      <div className="card w-full p-6 text-center sm:p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">
          {areaLabel} page could not load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {reloadRecommended
            ? "This looks like an outdated browser bundle after a deployment. Refreshing the page should load the latest admin code."
            : "Something failed while rendering this page. The console includes the technical details for debugging."}
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            Error digest: {error.digest}
          </p>
        )}
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
