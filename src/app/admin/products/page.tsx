"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Search,
} from "lucide-react";

import type {
  Brand,
  BrandListResponse,
  ProductWithSource,
  PaginatedResponse,
  SubModelListResponse,
} from "@/lib/types";
import { getApiErrorDescription, logAdminActionError, readApiError } from "@/lib/api-error";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const statusColors: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  published: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  archived: "bg-gray-100 text-gray-800 dark:bg-gray-700/40 dark:text-gray-300",
  hidden: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const columns: ColumnDef<ProductWithSource>[] = [
  {
    id: "code",
    header: "Code",
    cell: ({ row }) => {
      const code =
        row.original.product_codes?.product_code_data?.generated ?? "—";
      return (
        <Link
          href={`/admin/products/${row.original.id}`}
          className="font-mono text-sm text-primary hover:underline"
        >
          {code}
        </Link>
      );
    },
  },
  {
    id: "description",
    header: "Description",
    cell: ({ row }) => {
      const desc =
        row.original.product_codes?.description_data?.generated ?? "—";
      return (
        <span className="max-w-[250px] truncate block text-sm">{desc}</span>
      );
    },
  },
  {
    id: "brand",
    header: "Brand",
    cell: ({ row }) => {
      const primaryBrand = row.original.primary_brand?.name ?? "—";
      const additionalBrands = row.original.additional_brands;

      return (
        <div className="min-w-[140px]">
          <div className="font-medium">{primaryBrand}</div>
          {additionalBrands.length > 0 && (
            <div className="text-xs text-muted-foreground truncate">
              Also: {additionalBrands.map((brand) => brand.name).join(", ")}
            </div>
          )}
        </div>
      );
    },
  },
  { accessorKey: "model", header: "Model" },
  {
    accessorKey: "price",
    header: "Price",
    cell: ({ getValue }) => `$${Number(getValue<number>()).toFixed(2)}`,
  },
  {
    accessorKey: "stock",
    header: "Stock",
    cell: ({ getValue }) => getValue<number>(),
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.effective_status;
      return (
        <Badge variant="secondary" className={statusColors[status]}>
          {status}
        </Badge>
      );
    },
  },
];

export default function ProductsPage() {
  const [data, setData] = useState<ProductWithSource[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [primaryBrandFilter, setPrimaryBrandFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [subModels, setSubModels] = useState<string[]>([]);
  const [subModelsLoading, setSubModelsLoading] = useState(false);
  const [subModelFilter, setSubModelFilter] = useState("all");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });

  const handlePrimaryBrandFilterChange = (value: string) => {
    setPrimaryBrandFilter(value);
    setSubModelFilter("all");
    setSubModels([]);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  };

  const handleProductSearchChange = (value: string) => {
    setProductSearch(value);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  };

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.pageIndex + 1),
        pageSize: String(pagination.pageSize),
        visibility: "all",
      });
      if (productSearch.trim()) params.set("search", productSearch.trim());
      if (primaryBrandFilter !== "all") params.set("primaryBrandId", primaryBrandFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (subModelFilter !== "all") params.set("subModel", subModelFilter);

      const res = await fetch(`/api/products?${params}`);
      if (!res.ok) throw await readApiError(res, "Failed to load products");
      const json: PaginatedResponse<ProductWithSource> = await res.json();

      setData(json.data);
      setRowCount(json.count);
    } catch (err) {
      logAdminActionError("Failed to load products in admin", err, {
        primaryBrandFilter,
        productSearch,
        statusFilter,
        subModelFilter,
      });
      toast.error("Failed to load products", {
        description: getApiErrorDescription(err, "Unknown error"),
      });
    } finally {
      setLoading(false);
    }
  }, [pagination.pageIndex, pagination.pageSize, primaryBrandFilter, productSearch, statusFilter, subModelFilter]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    fetch("/api/brands?scope=primary")
      .then(async (res) => {
        if (!res.ok) throw await readApiError(res, "Failed to load brands");
        return res.json();
      })
      .then((data: BrandListResponse) => setBrands(data.brands ?? []))
      .catch((err: unknown) => {
        logAdminActionError("Failed to load product brand filters", err);
        toast.error("Failed to load brands", {
          description: getApiErrorDescription(err, "Unknown error"),
        });
      });
  }, []);

  useEffect(() => {
    if (primaryBrandFilter === "all") return;

    const controller = new AbortController();
    queueMicrotask(() => setSubModelsLoading(true));

    fetch(`/api/products/submodels?primaryBrandId=${primaryBrandFilter}`, { signal: controller.signal })
      .then(async (res) => {
        const json = (await res.json()) as SubModelListResponse & { error?: string };
        if (!res.ok) throw await readApiError(res, "Failed to load submodels");
        setSubModels(Array.isArray(json.subModels) ? json.subModels : []);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        logAdminActionError("Failed to load product submodel filters", err, {
          primaryBrandFilter,
        });
        setSubModels([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSubModelsLoading(false);
      });

    return () => controller.abort();
  }, [primaryBrandFilter]);

  // Reset to page 0 when filters change (subModel handled by handler)
  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [subModelFilter]);

  const table = useReactTable({
    data,
    columns,
    rowCount,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  const pageCount = table.getPageCount();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Products</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your product catalog
        </p>
      </div>

      <div className="card p-4 sm:p-6 md:p-8">
        {/* Filters */}
        <div className="flex flex-col gap-3 mb-6 lg:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={productSearch}
              onChange={(event) => handleProductSearchChange(event.target.value)}
              placeholder="Search code or description"
              className="pl-10"
            />
          </div>
          <Select value={primaryBrandFilter} onValueChange={handlePrimaryBrandFilterChange}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Primary brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All primary brands</SelectItem>
              {brands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={subModelFilter}
            onValueChange={(value) => {
              setSubModelFilter(value);
              setPagination((prev) => ({ ...prev, pageIndex: 0 }));
            }}
            disabled={primaryBrandFilter === "all" || subModelsLoading || subModels.length === 0}
          >
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder={primaryBrandFilter === "all" ? "Select brand first" : "SubModel"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All submodels</SelectItem>
              {subModels.map((subModel) => (
                <SelectItem key={subModel} value={subModel}>
                  {subModel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-md border overflow-x-auto -mx-4 sm:mx-0">
          <Table className="min-w-[640px]">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="px-4 sm:px-6 py-3 whitespace-nowrap">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-32 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                    No products found.
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm mt-6">
          <span className="text-muted-foreground">
            {rowCount} total products
          </span>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-muted-foreground mr-1">
              Page {pagination.pageIndex + 1} of {pageCount || 1}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.setPageIndex(pageCount - 1)}
              disabled={!table.getCanNextPage()}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
