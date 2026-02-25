"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { uploadImage, deleteImage } from "@/lib/upload";

type SingleImageUploadProps = {
  /** Current image URL or undefined */
  value?: string;
  /** Called with new URL after upload, or undefined after delete */
  onChange: (url: string | undefined) => void;
  /** Folder prefix for blob storage (e.g. "ABC123/left-main") */
  folder: string;
  label: string;
};

/** Single image slot — upload / replace / delete */
export function SingleImageUpload({
  value,
  onChange,
  folder,
  label,
}: SingleImageUploadProps) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      try {
        // Delete the old image if replacing
        if (value) {
          await deleteImage(value).catch(() => {});
        }
        const url = await uploadImage(file, folder);
        onChange(url);
        toast.success(`${label} uploaded`);
      } catch (err) {
        toast.error(`Failed to upload ${label}`, {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setUploading(false);
        // Reset file input
        e.target.value = "";
      }
    },
    [value, folder, label, onChange]
  );

  const handleDelete = useCallback(async () => {
    if (!value) return;
    try {
      await deleteImage(value);
      onChange(undefined);
      toast.success(`${label} removed`);
    } catch (err) {
      toast.error(`Failed to delete ${label}`, {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [value, label, onChange]);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="relative w-full aspect-square max-w-[200px] rounded-md border border-dashed flex items-center justify-center bg-muted/30 overflow-hidden">
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : value ? (
          <Image
            src={value}
            alt={label}
            fill
            className="object-cover"
            sizes="200px"
            unoptimized
          />
        ) : (
          <label className="cursor-pointer flex flex-col items-center gap-1 text-muted-foreground text-xs p-4">
            <ImagePlus className="h-8 w-8" />
            <span>Click to upload</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUpload}
            />
          </label>
        )}
      </div>
      {value && (
        <div className="flex gap-2">
          <label className="cursor-pointer">
            <Button variant="outline" size="sm" asChild>
              <span>
                Replace
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUpload}
                />
              </span>
            </Button>
          </label>
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="h-3 w-3 mr-1" />
            Remove
          </Button>
        </div>
      )}
    </div>
  );
}

type MultiImageUploadProps = {
  /** Array of image URLs (up to max) */
  value: string[];
  onChange: (urls: string[]) => void;
  folder: string;
  label: string;
  max?: number;
};

/** Multiple image slots — add / remove / reorder (up to max) */
export function MultiImageUpload({
  value,
  onChange,
  folder,
  label,
  max = 3,
}: MultiImageUploadProps) {
  const [uploading, setUploading] = useState(false);

  const handleAdd = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      try {
        const url = await uploadImage(file, folder);
        onChange([...value, url]);
        toast.success(`${label} image added`);
      } catch (err) {
        toast.error(`Failed to upload`, {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [value, folder, label, onChange]
  );

  const handleRemove = useCallback(
    async (index: number) => {
      const url = value[index];
      try {
        await deleteImage(url);
      } catch {
        // Continue removing from state even if blob delete fails
      }
      onChange(value.filter((_, i) => i !== index));
    },
    [value, onChange]
  );

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {label} ({value.length}/{max})
      </p>
      <div className="flex gap-3 flex-wrap">
        {value.map((url, i) => (
          <div
            key={url}
            className="relative w-[120px] h-[120px] rounded-md border overflow-hidden group"
          >
            <Image
              src={url}
              alt={`${label} ${i + 1}`}
              fill
              className="object-cover"
              sizes="120px"
              unoptimized
            />
            <button
              type="button"
              onClick={() => handleRemove(i)}
              className="absolute top-1 right-1 bg-destructive text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {value.length < max && (
          <label className="w-[120px] h-[120px] rounded-md border border-dashed flex items-center justify-center cursor-pointer bg-muted/30 text-muted-foreground hover:bg-muted/50 transition-colors">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ImagePlus className="h-5 w-5" />
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAdd}
            />
          </label>
        )}
      </div>
    </div>
  );
}
