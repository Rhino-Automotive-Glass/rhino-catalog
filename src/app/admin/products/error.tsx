"use client";

import { AdminErrorBoundary } from "@/components/admin-error-boundary";

type ProductsErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ProductsError(props: ProductsErrorProps) {
  return (
    <AdminErrorBoundary
      {...props}
      areaLabel="Products admin"
      backHref="/admin/products"
      backLabel="Back to products"
    />
  );
}
