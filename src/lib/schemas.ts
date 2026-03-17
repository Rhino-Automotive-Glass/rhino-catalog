import { z } from "zod";

/** Zod schema matching the ProductImages jsonb shape */
export const productImagesSchema = z.object({
  main: z.object({
    left: z.string().url().optional(),
    right: z.string().url().optional(),
    back: z.string().url().optional(),
  }),
  details: z.object({
    left: z.array(z.string().url()).max(3),
    right: z.array(z.string().url()).max(3),
    back: z.array(z.string().url()).max(3),
  }),
});

/** Schema for editing a product via the form (catalog-owned fields only) */
export const productFormSchema = z.object({
  price: z.number().min(0, "Price must be >= 0"),
  stock: z.number().int().min(0, "Stock must be >= 0"),
  primary_brand_id: z.string().uuid().nullable(),
  additional_brand_ids: z.array(z.string().uuid()).default([]),
  model: z.string().nullable(),
  subModel: z.string().nullable(),
  status: z.enum(["draft", "published", "archived"]),
  images: productImagesSchema,
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

/** Default empty images object */
export const emptyImages: z.infer<typeof productImagesSchema> = {
  main: {},
  details: { left: [], right: [], back: [] },
};
