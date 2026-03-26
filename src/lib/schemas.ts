import { z } from "zod";

/** Zod schema matching the flattened ProductImages shape (single URL max) */
export const productImagesSchema = z.array(z.string().url()).max(1);

/** Schema for editing a product via the form (catalog-owned fields only) */
export const productFormSchema = z.object({
  price: z.number().min(0, "Price must be >= 0"),
  stock: z.number().int().min(0, "Stock must be >= 0"),
  primary_brand_id: z.string().uuid().nullable(),
  additional_brand_ids: z.array(z.string().uuid()),
  model: z.string().nullable(),
  subModel: z.string().nullable(),
  status: z.enum(["draft", "published", "archived"]),
  images: productImagesSchema,
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

/** Default empty images list */
export const emptyImages: z.infer<typeof productImagesSchema> = [];
