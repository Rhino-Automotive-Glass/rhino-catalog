/** Structured images stored in the products.images jsonb column */
export type ProductImages = {
  main: {
    left?: string;
    right?: string;
    back?: string;
  };
  details: {
    left: string[];
    right: string[];
    back: string[];
  };
};

export type ProductStatus = "draft" | "published" | "archived";

/** Row shape of the `products` table */
export type Product = {
  id: string;
  product_code_id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  rhino_code: string;
  rhino_description: string;
  brand: string | null;
  brands: string[];
  model: string | null;
  subModel: string | null;
  images: ProductImages;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
};

/** Row shape of the existing `product_codes` table (relevant fields) */
export type ProductCode = {
  id: string;
  compatibility_data: {
    generated?: string;
    items?: Array<{
      marca?: string;
      modelo?: string;
      subModelo?: string;
    }>;
  } | null;
  description_data: {
    generated?: string;
  } | null;
  product_code_data: {
    generated?: string;
  } | null;
};

/** Paginated API response */
export type PaginatedResponse<T> = {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
};
