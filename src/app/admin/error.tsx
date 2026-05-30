"use client";

import { AdminErrorBoundary } from "@/components/admin-error-boundary";

type AdminErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AdminError(props: AdminErrorProps) {
  return <AdminErrorBoundary {...props} />;
}
