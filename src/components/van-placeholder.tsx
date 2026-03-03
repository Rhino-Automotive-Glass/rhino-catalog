import Image from "next/image";
import { cn } from "@/lib/utils";

export function VanPlaceholder({ className }: { className?: string }) {
  return (
    <Image
      src="/van.webp"
      alt="No image available"
      width={640}
      height={360}
      className={cn("object-contain dark:invert", className)}
    />
  );
}
