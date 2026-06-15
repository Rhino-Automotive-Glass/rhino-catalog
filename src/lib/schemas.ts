import { z } from "zod";

const imageUrlOrPathSchema = z
  .string()
  .trim()
  .refine(
    (value) => value.startsWith("/") || z.string().url().safeParse(value).success,
    "Image must be a valid URL or app image path"
  );

/** Zod schema matching the flattened ProductImages shape (single image max) */
export const productImagesSchema = z.array(imageUrlOrPathSchema).max(1);

export const productGroupImagesSchema = z
  .array(imageUrlOrPathSchema)
  .max(3, "Product groups can have at most 3 images");

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

const nullableTextSchema = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable()
  .optional();

export const productGroupStatusSchema = z.enum(["draft", "published", "archived"]);

const productGroupBaseSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens"),
  name: z.string().trim().min(1, "Name is required"),
  description: nullableTextSchema,
  images: productGroupImagesSchema,
  brand_id: z.string().uuid().nullable(),
  model: nullableTextSchema,
  sub_model: nullableTextSchema,
  version: nullableTextSchema,
  additional: nullableTextSchema,
  other: nullableTextSchema,
  year_start: z.number().int().min(1900).max(2100).nullable(),
  year_end: z.number().int().min(1900).max(2100).nullable(),
  status: productGroupStatusSchema,
  sort_order: z.number().int(),
});

function hasValidYearRange(values: { year_start?: number | null; year_end?: number | null }) {
  return (
    values.year_start === undefined ||
    values.year_end === undefined ||
    values.year_start === null ||
    values.year_end === null ||
    values.year_start <= values.year_end
  );
}

export const productGroupFormSchema = productGroupBaseSchema.refine(hasValidYearRange, {
  message: "Start year must be before end year",
  path: ["year_end"],
});

export const productGroupCreateSchema = productGroupFormSchema;
export const productGroupUpdateSchema = productGroupBaseSchema.partial().refine(hasValidYearRange, {
  message: "Start year must be before end year",
  path: ["year_end"],
});

export const productGroupProductAddSchema = z.object({
  product_id: z.string().uuid(),
  sort_order: z.number().int().optional(),
  is_featured: z.boolean().optional(),
});

export const productGroupProductUpdateSchema = z.object({
  product_id: z.string().uuid().optional(),
  sort_order: z.number().int().optional(),
  is_featured: z.boolean().optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        sort_order: z.number().int(),
        is_featured: z.boolean().optional(),
      })
    )
    .optional(),
});

export type ProductGroupFormValues = z.infer<typeof productGroupFormSchema>;
