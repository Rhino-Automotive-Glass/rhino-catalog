"use client";

import { ChevronDown } from "lucide-react";

import type { Brand } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type BrandMultiSelectProps = {
  disabled?: boolean;
  options: Brand[];
  placeholder?: string;
  selectedIds: string[];
  onChange: (nextSelectedIds: string[]) => void;
};

export function BrandMultiSelect({
  disabled = false,
  options,
  placeholder = "Select brands",
  selectedIds,
  onChange,
}: BrandMultiSelectProps) {
  const selectedBrands = options.filter((brand) => selectedIds.includes(brand.id));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          <span className="truncate">
            {selectedBrands.length === 0
              ? placeholder
              : selectedBrands.length === 1
                ? selectedBrands[0].name
                : `${selectedBrands.length} brands selected`}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[280px]" align="start">
        <DropdownMenuLabel>Additional brands</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            No brands available.
          </div>
        ) : (
          options.map((brand) => (
            <DropdownMenuCheckboxItem
              key={brand.id}
              checked={selectedIds.includes(brand.id)}
              onCheckedChange={(nextChecked) => {
                if (nextChecked === true) {
                  onChange([...selectedIds, brand.id]);
                  return;
                }

                onChange(selectedIds.filter((selectedId) => selectedId !== brand.id));
              }}
            >
              {brand.name}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
