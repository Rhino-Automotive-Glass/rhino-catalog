"use client";

import { AdminErrorBoundary } from "@/components/admin-error-boundary";

type ProductGroupsErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ProductGroupsError(props: ProductGroupsErrorProps) {
  return (
    <AdminErrorBoundary
      {...props}
      areaLabel="Product groups admin"
      backHref="/admin/product-groups"
      backLabel="Back to groups"
    />
  );
}
