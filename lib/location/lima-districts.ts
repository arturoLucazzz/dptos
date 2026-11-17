/**
 * The 43 districts of the province of Lima. Callao is a separate province and is out.
 * Slugs match scraper/src/config/districts.ts for the scraped districts.
 */

export const LIMA_PROVINCE_DISTRICTS = [
  { slug: 'lima', name: 'Lima' },
  { slug: 'ancon', name: 'Ancón' },
  { slug: 'ate', name: 'Ate' },
  { slug: 'barranco', name: 'Barranco' },
  { slug: 'brena', name: 'Breña' },
  { slug: 'carabayllo', name: 'Carabayllo' },
  { slug: 'chaclacayo', name: 'Chaclacayo' },
  { slug: 'chorrillos', name: 'Chorrillos' },
  { slug: 'cieneguilla', name: 'Cieneguilla' },
  { slug: 'comas', name: 'Comas' },
  { slug: 'el-agustino', name: 'El Agustino' },
  { slug: 'independencia', name: 'Independencia' },
  { slug: 'jesus-maria', name: 'Jesús María' },
  { slug: 'la-molina', name: 'La Molina' },
  { slug: 'la-victoria', name: 'La Victoria' },
  { slug: 'lince', name: 'Lince' },
  { slug: 'los-olivos', name: 'Los Olivos' },
  { slug: 'lurigancho', name: 'Lurigancho' },
  { slug: 'lurin', name: 'Lurín' },
  { slug: 'magdalena', name: 'Magdalena del Mar' },
  { slug: 'miraflores', name: 'Miraflores' },
  { slug: 'pachacamac', name: 'Pachacámac' },
  { slug: 'pucusana', name: 'Pucusana' },
  { slug: 'pueblo-libre', name: 'Pueblo Libre' },
  { slug: 'puente-piedra', name: 'Puente Piedra' },
  { slug: 'punta-hermosa', name: 'Punta Hermosa' },
  { slug: 'punta-negra', name: 'Punta Negra' },
  { slug: 'rimac', name: 'Rímac' },
  { slug: 'san-bartolo', name: 'San Bartolo' },
  { slug: 'san-borja', name: 'San Borja' },
  { slug: 'san-isidro', name: 'San Isidro' },
  { slug: 'san-juan-de-lurigancho', name: 'San Juan de Lurigancho' },
  { slug: 'san-juan-de-miraflores', name: 'San Juan de Miraflores' },
  { slug: 'san-luis', name: 'San Luis' },
  { slug: 'san-martin-de-porres', name: 'San Martín de Porres' },
  { slug: 'san-miguel', name: 'San Miguel' },
  { slug: 'santa-anita', name: 'Santa Anita' },
  { slug: 'santa-maria-del-mar', name: 'Santa María del Mar' },
  { slug: 'santa-rosa', name: 'Santa Rosa' },
  { slug: 'santiago-de-surco', name: 'Santiago de Surco' },
  { slug: 'surquillo', name: 'Surquillo' },
  { slug: 'villa-el-salvador', name: 'Villa El Salvador' },
  { slug: 'villa-maria-del-triunfo', name: 'Villa María del Triunfo' },
] as const satisfies readonly { slug: string; name: string }[];

const SLUGS = new Set<string>(LIMA_PROVINCE_DISTRICTS.map((d) => d.slug));

export function isLimaDistrict(slug: string): boolean {
  return SLUGS.has(slug);
}
