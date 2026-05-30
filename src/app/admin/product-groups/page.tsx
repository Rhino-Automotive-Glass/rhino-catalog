"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Plus,
  Search,
} from "lucide-react";

import type { PaginatedResponse, ProductGroup } from "@/lib/types";
import { getCatalogImageSrc } from "@/lib/catalog-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { getApiErrorDescription, logAdminActionError, readApiError } from "@/lib/api-error";

const statusColors: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  published: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  archived: "bg-gray-100 text-gray-800 dark:bg-gray-700/40 dark:text-gray-300",
};
const PAGE_SIZE = 20;

function formatYears(group: ProductGroup): string {
  if (!group.year_start && !group.year_end) return "Any year";
  if (group.year_start && group.year_end) return `${group.year_start}-${group.year_end}`;
  return String(group.year_start ?? group.year_end);
}

export default function ProductGroupsPage() {
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const fetchGroups = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        status,
      });

      if (search.trim()) {
        params.set("search", search.trim());
      }

      const res = await fetch(`/api/product-groups?${params}`);
      if (!res.ok) throw await readApiError(res, "Failed to load product groups");
      const json = (await res.json()) as PaginatedResponse<ProductGroup> & { error?: string };

      setGroups(Array.isArray(json.data) ? json.data : []);
      setRowCount(typeof json.count === "number" ? json.count : 0);
    } catch (error) {
      setGroups([]);
      setRowCount(0);
      logAdminActionError("Failed to load product groups in admin", error, {
        search,
        status,
      });
      toast.error("Failed to load product groups", {
        description: getApiErrorDescription(error, "Unknown error"),
      });
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    const timeoutId = window.setTimeout(fetchGroups, 200);
    return () => window.clearTimeout(timeoutId);
  }, [fetchGroups]);

  const totalPages = Math.max(1, Math.ceil(rowCount / PAGE_SIZE));

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleStatusChange(value: string) {
    setStatus(value);
    setPage(1);
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Product Groups</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Curate product sets for specific vehicle applications.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/product-groups/new">
            <Plus className="h-4 w-4" />
            New group
          </Link>
        </Button>
      </div>

      <div className="card p-4 sm:p-6 md:p-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search groups by name, description, model, or submodel"
              className="pl-10"
            />
          </div>
          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[88px]">Image</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Application</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Sort</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : groups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No product groups found.
                  </TableCell>
                </TableRow>
              ) : (
                groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell>
                      <div className="relative h-12 w-16 overflow-hidden rounded-md border bg-muted">
                        <Image
                          src={getCatalogImageSrc(group.images[0])}
                          alt={group.name}
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/product-groups/${group.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {group.name}
                      </Link>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {group.slug}
                      </p>
                      {group.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {group.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>{group.brand?.name ?? "Any brand"}</TableCell>
                    <TableCell>
                      <div className="font-medium">{group.sub_model ?? group.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatYears(group)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusColors[group.status]}>
                        {group.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{group.sort_order}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-6 flex flex-col items-center justify-between gap-3 text-sm sm:flex-row">
          <span className="text-muted-foreground">{rowCount} total groups</span>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="mr-1 text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(1)}
              disabled={page <= 1}
              aria-label="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              aria-label="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
