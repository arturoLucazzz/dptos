/** Tipo de apartamento para la app (alineado con scraper/src/types). */
export interface ApartmentData {
  id: string;
  source: string;
  title: string | null;
  description?: string | null;
  url: string;
  location: string;
  address: string | null;
  district?: string | null;
  city?: string | null;
  limaDistrictSlug?: string | null;
  limaDistrictName?: string | null;
  price: number | null;
  priceFormatted: string | null;
  expenses?: number | null;
  expensesFormatted?: string | null;
  currency?: string;
  propertyType: string;
  operationType: string;
  developmentStage?: string | null;
  deliveryDate?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  area?: number | null;
  parkingSpots?: number | null;
  features?: Array<{ id?: string; label: string; value: string | number; measure?: string | null }>;
  images?: Array<{ url: string; thumbnail?: string; order?: number }>;
  publisher?: { id?: string; name: string | null; logo?: string | null; url?: string | null } | null;
  scrapedAt: string;
}

export interface ScraperResult {
  source: string;
  scrapedAt: string;
  totalResults: number;
  apartments: ApartmentData[];
}

export const STAGE_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "Entrega inmediata", label: "Entrega inmediata" },
  { value: "En construcción", label: "En construcción" },
  { value: "En planos", label: "En planos" },
] as const;
