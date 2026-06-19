// Módulo Prospecção Ativa: scraping com Bing + DuckDuckGo (mais bot-friendly que Google)
// + CRUD de leads e settings.

import * as cheerio from 'cheerio';
import { supabaseAdmin } from './supabase-admin';
import { scrapeSchema, extractUrlsSchema, prospectingSettingsSchema } from './validators';
import { AppError } from './errors';
import type { AuthContext } from './auth';

// =============================================================================
// SCRAPING
// =============================================================================

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// User-Agent IDENTIFICÁVEL pro Overpass (UA de navegador genérico é tratado como abuso → 406).
// Etiqueta OSM: https://operations.osmfoundation.org/policies/nominatim/ — identifique sua aplicação.
const OVERPASS_UA = 'geometric-forms-prospecting/1.0 (contato@geometric.com.br)';
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

// =============================================================================
// OPENSTREETMAP OVERPASS API — fonte principal de dados de negócios BR
// Free, sem cadastro, sem captcha. Funciona em qualquer IP.
// =============================================================================

// Mapeamento de nicho amigável → OSM tags
// docs: https://wiki.openstreetmap.org/wiki/Map_features
const NICHE_TO_OSM: Record<string, Array<{ k: string; v: string }>> = {
  // ===== Beleza & Estética =====
  'estetica': [{ k: 'shop', v: 'beauty' }, { k: 'leisure', v: 'spa' }],
  'salao de beleza': [{ k: 'shop', v: 'beauty' }, { k: 'shop', v: 'hairdresser' }],
  'cabeleireiro': [{ k: 'shop', v: 'hairdresser' }],
  'barbearia': [{ k: 'shop', v: 'hairdresser' }],
  'manicure': [{ k: 'shop', v: 'beauty' }],
  'spa': [{ k: 'leisure', v: 'spa' }, { k: 'shop', v: 'massage' }],
  'massagem': [{ k: 'shop', v: 'massage' }],
  'tatuagem': [{ k: 'shop', v: 'tattoo' }],
  'perfumaria': [{ k: 'shop', v: 'perfumery' }, { k: 'shop', v: 'cosmetics' }],
  'cosmeticos': [{ k: 'shop', v: 'cosmetics' }],
  // ===== Saúde =====
  'clinica': [{ k: 'amenity', v: 'clinic' }, { k: 'amenity', v: 'doctors' }],
  'hospital': [{ k: 'amenity', v: 'hospital' }],
  'dentista': [{ k: 'amenity', v: 'dentist' }, { k: 'healthcare', v: 'dentist' }],
  'odontologia': [{ k: 'amenity', v: 'dentist' }, { k: 'healthcare', v: 'dentist' }],
  'medico': [{ k: 'amenity', v: 'doctors' }, { k: 'healthcare', v: 'doctor' }],
  'psicologia': [{ k: 'healthcare', v: 'psychotherapist' }, { k: 'healthcare', v: 'psychologist' }],
  'fisioterapia': [{ k: 'healthcare', v: 'physiotherapist' }],
  'nutricionista': [{ k: 'healthcare', v: 'nutritionist' }],
  'veterinario': [{ k: 'amenity', v: 'veterinary' }],
  'farmacia': [{ k: 'amenity', v: 'pharmacy' }],
  'laboratorio': [{ k: 'healthcare', v: 'laboratory' }],
  'oftalmologia': [{ k: 'healthcare', v: 'optometrist' }],
  'plano de saude': [{ k: 'office', v: 'insurance' }],
  // ===== Comida =====
  'restaurante': [{ k: 'amenity', v: 'restaurant' }],
  'pizzaria': [{ k: 'amenity', v: 'restaurant' }, { k: 'cuisine', v: 'pizza' }],
  'lanchonete': [{ k: 'amenity', v: 'fast_food' }],
  'hamburgueria': [{ k: 'amenity', v: 'fast_food' }, { k: 'cuisine', v: 'burger' }],
  'cafeteria': [{ k: 'amenity', v: 'cafe' }],
  'padaria': [{ k: 'shop', v: 'bakery' }],
  'confeitaria': [{ k: 'shop', v: 'bakery' }, { k: 'shop', v: 'pastry' }],
  'doceria': [{ k: 'shop', v: 'confectionery' }, { k: 'shop', v: 'pastry' }],
  'sorveteria': [{ k: 'amenity', v: 'ice_cream' }],
  'bar': [{ k: 'amenity', v: 'bar' }, { k: 'amenity', v: 'pub' }],
  'churrascaria': [{ k: 'amenity', v: 'restaurant' }, { k: 'cuisine', v: 'barbecue' }],
  'acai': [{ k: 'amenity', v: 'ice_cream' }],
  'sushi': [{ k: 'amenity', v: 'restaurant' }, { k: 'cuisine', v: 'sushi' }],
  // ===== Comércio =====
  'mercado': [{ k: 'shop', v: 'supermarket' }, { k: 'shop', v: 'convenience' }],
  'mercearia': [{ k: 'shop', v: 'convenience' }, { k: 'shop', v: 'greengrocer' }],
  'hortifruti': [{ k: 'shop', v: 'greengrocer' }],
  'acougue': [{ k: 'shop', v: 'butcher' }],
  'peixaria': [{ k: 'shop', v: 'seafood' }],
  'roupas': [{ k: 'shop', v: 'clothes' }],
  'loja de roupas': [{ k: 'shop', v: 'clothes' }],
  'moda infantil': [{ k: 'shop', v: 'clothes' }],
  'sapataria': [{ k: 'shop', v: 'shoes' }],
  'otica': [{ k: 'shop', v: 'optician' }],
  'joalheria': [{ k: 'shop', v: 'jewelry' }],
  'pet shop': [{ k: 'shop', v: 'pet' }],
  'floricultura': [{ k: 'shop', v: 'florist' }],
  'papelaria': [{ k: 'shop', v: 'stationery' }],
  'livraria': [{ k: 'shop', v: 'books' }],
  'eletronicos': [{ k: 'shop', v: 'electronics' }],
  'celular': [{ k: 'shop', v: 'mobile_phone' }],
  'informatica': [{ k: 'shop', v: 'computer' }],
  'movelaria': [{ k: 'shop', v: 'furniture' }],
  'colchao': [{ k: 'shop', v: 'bed' }, { k: 'shop', v: 'furniture' }],
  'tecidos': [{ k: 'shop', v: 'fabric' }],
  'tintas': [{ k: 'shop', v: 'paint' }],
  'material de construcao': [{ k: 'shop', v: 'hardware' }, { k: 'shop', v: 'doityourself' }],
  'ferragens': [{ k: 'shop', v: 'hardware' }],
  'utilidades': [{ k: 'shop', v: 'houseware' }],
  'brinquedos': [{ k: 'shop', v: 'toys' }],
  'esportes': [{ k: 'shop', v: 'sports' }],
  'bicicletaria': [{ k: 'shop', v: 'bicycle' }],
  'musica': [{ k: 'shop', v: 'musical_instrument' }],
  'antiquario': [{ k: 'shop', v: 'antiques' }],
  'presentes': [{ k: 'shop', v: 'gift' }],
  // ===== Automotivo =====
  'oficina': [{ k: 'shop', v: 'car_repair' }, { k: 'amenity', v: 'car_repair' }],
  'mecanica': [{ k: 'shop', v: 'car_repair' }],
  'lava jato': [{ k: 'amenity', v: 'car_wash' }],
  'autopecas': [{ k: 'shop', v: 'car_parts' }],
  'borracharia': [{ k: 'shop', v: 'tyres' }],
  'concessionaria': [{ k: 'shop', v: 'car' }],
  'motos': [{ k: 'shop', v: 'motorcycle' }],
  'aluguel de carro': [{ k: 'amenity', v: 'car_rental' }],
  'posto de combustivel': [{ k: 'amenity', v: 'fuel' }],
  // ===== Serviços =====
  'academia': [{ k: 'leisure', v: 'fitness_centre' }, { k: 'sport', v: 'fitness' }],
  'crossfit': [{ k: 'leisure', v: 'fitness_centre' }],
  'pilates': [{ k: 'leisure', v: 'fitness_centre' }],
  'escola': [{ k: 'amenity', v: 'school' }],
  'creche': [{ k: 'amenity', v: 'kindergarten' }],
  'cursos': [{ k: 'amenity', v: 'school' }, { k: 'amenity', v: 'training' }],
  'autoescola': [{ k: 'amenity', v: 'driving_school' }],
  'imobiliaria': [{ k: 'office', v: 'estate_agent' }],
  'contador': [{ k: 'office', v: 'accountant' }],
  'advocacia': [{ k: 'office', v: 'lawyer' }],
  'advogado': [{ k: 'office', v: 'lawyer' }],
  'seguros': [{ k: 'office', v: 'insurance' }],
  'agencia de viagem': [{ k: 'shop', v: 'travel_agency' }, { k: 'office', v: 'travel_agent' }],
  'hotel': [{ k: 'tourism', v: 'hotel' }],
  'pousada': [{ k: 'tourism', v: 'guest_house' }, { k: 'tourism', v: 'hotel' }],
  'hostel': [{ k: 'tourism', v: 'hostel' }],
  'banco': [{ k: 'amenity', v: 'bank' }],
  'casa lotérica': [{ k: 'shop', v: 'lottery' }],
  'correios': [{ k: 'amenity', v: 'post_office' }],
  'cartorio': [{ k: 'office', v: 'notary' }],
  'lavanderia': [{ k: 'shop', v: 'laundry' }],
  'gráfica': [{ k: 'shop', v: 'copyshop' }, { k: 'craft', v: 'printer' }],
  'foto': [{ k: 'shop', v: 'photo' }],
  'chaveiro': [{ k: 'shop', v: 'locksmith' }],
  'funeraria': [{ k: 'shop', v: 'funeral_directors' }],
  'igreja': [{ k: 'amenity', v: 'place_of_worship' }],
  'cinema': [{ k: 'amenity', v: 'cinema' }],
  'teatro': [{ k: 'amenity', v: 'theatre' }],
  'museu': [{ k: 'tourism', v: 'museum' }],
  'biblioteca': [{ k: 'amenity', v: 'library' }],
  // ===== Construção & Arquitetura =====
  'arquiteto': [{ k: 'office', v: 'architect' }],
  'engenharia': [{ k: 'office', v: 'engineer' }],
  'construtora': [{ k: 'craft', v: 'builder' }],
  'eletricista': [{ k: 'craft', v: 'electrician' }],
  'encanador': [{ k: 'craft', v: 'plumber' }],
  'marceneiro': [{ k: 'craft', v: 'carpenter' }],
  'serralheiro': [{ k: 'craft', v: 'metal_construction' }],
  'pintor': [{ k: 'craft', v: 'painter' }],
};

// Bounding boxes (sul, oeste, norte, leste) das principais cidades BR.
// Cobertura razoável das áreas urbanas centrais.
const CITY_BBOX: Record<string, { name: string; bbox: string }> = {
  'sao-paulo':         { name: 'São Paulo',         bbox: '-23.80,-46.85,-23.40,-46.36' },
  'rio-de-janeiro':    { name: 'Rio de Janeiro',    bbox: '-23.10,-43.80,-22.75,-43.10' },
  'belo-horizonte':    { name: 'Belo Horizonte',    bbox: '-20.05,-44.05,-19.78,-43.86' },
  'brasilia':          { name: 'Brasília',          bbox: '-15.90,-48.10,-15.65,-47.75' },
  'salvador':          { name: 'Salvador',          bbox: '-13.05,-38.55,-12.85,-38.34' },
  'fortaleza':         { name: 'Fortaleza',         bbox: '-3.85,-38.65,-3.70,-38.42' },
  'curitiba':          { name: 'Curitiba',          bbox: '-25.62,-49.40,-25.36,-49.18' },
  'recife':            { name: 'Recife',            bbox: '-8.15,-35.05,-7.95,-34.85' },
  'porto-alegre':      { name: 'Porto Alegre',      bbox: '-30.20,-51.30,-29.95,-51.05' },
  'manaus':            { name: 'Manaus',            bbox: '-3.20,-60.10,-3.00,-59.85' },
  'belem':             { name: 'Belém',             bbox: '-1.50,-48.55,-1.30,-48.35' },
  'goiania':           { name: 'Goiânia',           bbox: '-16.80,-49.40,-16.60,-49.20' },
  'campinas':          { name: 'Campinas',          bbox: '-23.00,-47.20,-22.80,-46.95' },
  'sao-luis':          { name: 'São Luís',          bbox: '-2.65,-44.40,-2.45,-44.20' },
  'maceio':            { name: 'Maceió',            bbox: '-9.75,-35.85,-9.55,-35.65' },
  'natal':             { name: 'Natal',             bbox: '-5.90,-35.30,-5.70,-35.15' },
  'joao-pessoa':       { name: 'João Pessoa',       bbox: '-7.20,-34.95,-7.05,-34.80' },
  'florianopolis':     { name: 'Florianópolis',     bbox: '-27.75,-48.65,-27.40,-48.40' },
  'vitoria':           { name: 'Vitória',           bbox: '-20.40,-40.40,-20.20,-40.20' },
  'cuiaba':            { name: 'Cuiabá',            bbox: '-15.70,-56.20,-15.50,-55.95' },
  'campo-grande':      { name: 'Campo Grande',      bbox: '-20.55,-54.75,-20.35,-54.50' },
  'aracaju':           { name: 'Aracaju',           bbox: '-10.99,-37.15,-10.85,-37.00' },
  'teresina':          { name: 'Teresina',          bbox: '-5.15,-42.85,-4.95,-42.70' },
  'guarulhos':         { name: 'Guarulhos',         bbox: '-23.50,-46.55,-23.40,-46.40' },
  'sao-bernardo':      { name: 'São Bernardo',      bbox: '-23.80,-46.65,-23.65,-46.45' },
  'santo-andre':       { name: 'Santo André',       bbox: '-23.70,-46.55,-23.60,-46.45' },
  'osasco':            { name: 'Osasco',            bbox: '-23.55,-46.85,-23.45,-46.70' },
  'sorocaba':          { name: 'Sorocaba',          bbox: '-23.55,-47.55,-23.40,-47.35' },
  'ribeirao-preto':    { name: 'Ribeirão Preto',    bbox: '-21.25,-47.90,-21.10,-47.70' },
  'sao-jose-campos':   { name: 'São José dos Campos',bbox:'-23.30,-46.05,-23.10,-45.80' },
  'niteroi':           { name: 'Niterói',           bbox: '-22.95,-43.15,-22.85,-43.00' },
};

export function listCitiesBR(): Array<{ slug: string; name: string }> {
  return Object.entries(CITY_BBOX).map(([slug, v]) => ({ slug, name: v.name }));
}
export function listNiches(): string[] {
  return Object.keys(NICHE_TO_OSM).sort();
}

// ===== Estados brasileiros (UF) =====
export type BRState = { uf: string; name: string };
const BR_STATES: BRState[] = [
  { uf: 'AC', name: 'Acre' },
  { uf: 'AL', name: 'Alagoas' },
  { uf: 'AP', name: 'Amapá' },
  { uf: 'AM', name: 'Amazonas' },
  { uf: 'BA', name: 'Bahia' },
  { uf: 'CE', name: 'Ceará' },
  { uf: 'DF', name: 'Distrito Federal' },
  { uf: 'ES', name: 'Espírito Santo' },
  { uf: 'GO', name: 'Goiás' },
  { uf: 'MA', name: 'Maranhão' },
  { uf: 'MT', name: 'Mato Grosso' },
  { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'MG', name: 'Minas Gerais' },
  { uf: 'PA', name: 'Pará' },
  { uf: 'PB', name: 'Paraíba' },
  { uf: 'PR', name: 'Paraná' },
  { uf: 'PE', name: 'Pernambuco' },
  { uf: 'PI', name: 'Piauí' },
  { uf: 'RJ', name: 'Rio de Janeiro' },
  { uf: 'RN', name: 'Rio Grande do Norte' },
  { uf: 'RS', name: 'Rio Grande do Sul' },
  { uf: 'RO', name: 'Rondônia' },
  { uf: 'RR', name: 'Roraima' },
  { uf: 'SC', name: 'Santa Catarina' },
  { uf: 'SP', name: 'São Paulo' },
  { uf: 'SE', name: 'Sergipe' },
  { uf: 'TO', name: 'Tocantins' },
];

export function listStatesBR(): BRState[] {
  return BR_STATES;
}

// Cache de cidades por UF (IBGE API). Sobrevive enquanto o lambda viver.
const citiesByUfCache = new Map<string, string[]>();

/**
 * Lista todos os municípios de um estado via IBGE API.
 * Fonte: https://servicodados.ibge.gov.br/api/docs/localidades
 */
export async function listCitiesByState(uf: string): Promise<string[]> {
  const norm = uf.toUpperCase();
  const cached = citiesByUfCache.get(norm);
  if (cached) return cached;
  const isValid = BR_STATES.some((s) => s.uf === norm);
  if (!isValid) throw new AppError(`UF inválida: ${uf}`, { status: 400 });
  try {
    const res = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${norm}/municipios`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) throw new Error(`IBGE HTTP ${res.status}`);
    const data: any = await res.json();
    const names = (Array.isArray(data) ? data : [])
      .map((m: any) => m?.nome)
      .filter((n: any): n is string => typeof n === 'string')
      .sort((a: string, b: string) => a.localeCompare(b, 'pt-BR'));
    citiesByUfCache.set(norm, names);
    return names;
  } catch (err: any) {
    throw new AppError(`Falha ao listar cidades de ${norm}: ${err?.message || 'erro'}`, { status: 502 });
  }
}

// Cache de bbox resolvidos por (uf, city). Evita bater no Nominatim repetidamente.
const bboxCache = new Map<string, string>();
// Pré-aquece o cache com as bbox manuais das principais cidades (mapeamento por nome+UF aproximado).
const PRESEEDED_BBOX: Array<{ city: string; uf: string; bbox: string }> = [
  { city: 'São Paulo', uf: 'SP', bbox: '-23.80,-46.85,-23.40,-46.36' },
  { city: 'Rio de Janeiro', uf: 'RJ', bbox: '-23.10,-43.80,-22.75,-43.10' },
  { city: 'Belo Horizonte', uf: 'MG', bbox: '-20.05,-44.05,-19.78,-43.86' },
  { city: 'Brasília', uf: 'DF', bbox: '-15.90,-48.10,-15.65,-47.75' },
  { city: 'Salvador', uf: 'BA', bbox: '-13.05,-38.55,-12.85,-38.34' },
  { city: 'Fortaleza', uf: 'CE', bbox: '-3.85,-38.65,-3.70,-38.42' },
  { city: 'Curitiba', uf: 'PR', bbox: '-25.62,-49.40,-25.36,-49.18' },
  { city: 'Recife', uf: 'PE', bbox: '-8.15,-35.05,-7.95,-34.85' },
  { city: 'Porto Alegre', uf: 'RS', bbox: '-30.20,-51.30,-29.95,-51.05' },
  { city: 'Manaus', uf: 'AM', bbox: '-3.20,-60.10,-3.00,-59.85' },
  { city: 'Belém', uf: 'PA', bbox: '-1.50,-48.55,-1.30,-48.35' },
  { city: 'Goiânia', uf: 'GO', bbox: '-16.80,-49.40,-16.60,-49.20' },
  { city: 'Campinas', uf: 'SP', bbox: '-23.00,-47.20,-22.80,-46.95' },
  { city: 'São Luís', uf: 'MA', bbox: '-2.65,-44.40,-2.45,-44.20' },
  { city: 'Maceió', uf: 'AL', bbox: '-9.75,-35.85,-9.55,-35.65' },
  { city: 'Natal', uf: 'RN', bbox: '-5.90,-35.30,-5.70,-35.15' },
  { city: 'João Pessoa', uf: 'PB', bbox: '-7.20,-34.95,-7.05,-34.80' },
  { city: 'Florianópolis', uf: 'SC', bbox: '-27.75,-48.65,-27.40,-48.40' },
  { city: 'Vitória', uf: 'ES', bbox: '-20.40,-40.40,-20.20,-40.20' },
  { city: 'Cuiabá', uf: 'MT', bbox: '-15.70,-56.20,-15.50,-55.95' },
  { city: 'Campo Grande', uf: 'MS', bbox: '-20.55,-54.75,-20.35,-54.50' },
  { city: 'Aracaju', uf: 'SE', bbox: '-10.99,-37.15,-10.85,-37.00' },
  { city: 'Teresina', uf: 'PI', bbox: '-5.15,-42.85,-4.95,-42.70' },
  { city: 'Guarulhos', uf: 'SP', bbox: '-23.50,-46.55,-23.40,-46.40' },
  { city: 'São Bernardo do Campo', uf: 'SP', bbox: '-23.80,-46.65,-23.65,-46.45' },
  { city: 'Santo André', uf: 'SP', bbox: '-23.70,-46.55,-23.60,-46.45' },
  { city: 'Osasco', uf: 'SP', bbox: '-23.55,-46.85,-23.45,-46.70' },
  { city: 'Sorocaba', uf: 'SP', bbox: '-23.55,-47.55,-23.40,-47.35' },
  { city: 'Ribeirão Preto', uf: 'SP', bbox: '-21.25,-47.90,-21.10,-47.70' },
  { city: 'São José dos Campos', uf: 'SP', bbox: '-23.30,-46.05,-23.10,-45.80' },
  { city: 'Niterói', uf: 'RJ', bbox: '-22.95,-43.15,-22.85,-43.00' },
];
function bboxKey(city: string, uf: string): string {
  return `${uf.toUpperCase()}::${city.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()}`;
}
for (const e of PRESEEDED_BBOX) bboxCache.set(bboxKey(e.city, e.uf), e.bbox);

/**
 * Resolve bbox (south, west, north, east) de uma cidade via Nominatim.
 * Cache em memória sobrevive enquanto o lambda viver. Etiqueta OSM exige UA identificável.
 */
async function resolveCityBbox(city: string, uf: string): Promise<string | null> {
  const key = bboxKey(city, uf);
  const cached = bboxCache.get(key);
  if (cached) return cached;

  const stateName = BR_STATES.find((s) => s.uf === uf.toUpperCase())?.name;
  if (!stateName) return null;

  try {
    const q = `${city}, ${stateName}, Brasil`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=br`;
    const res = await fetch(url, {
      headers: { 'User-Agent': OVERPASS_UA, 'Accept-Language': 'pt-BR' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const hit = Array.isArray(data) && data[0];
    if (!hit || !Array.isArray(hit.boundingbox) || hit.boundingbox.length !== 4) return null;
    // Nominatim retorna [minLat, maxLat, minLon, maxLon] como strings.
    // Overpass espera "south,west,north,east" = "minLat,minLon,maxLat,maxLon".
    const [minLat, maxLat, minLon, maxLon] = hit.boundingbox.map(Number);
    if ([minLat, maxLat, minLon, maxLon].some((n) => !Number.isFinite(n))) return null;
    const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;
    bboxCache.set(key, bbox);
    return bbox;
  } catch {
    return null;
  }
}

function nicheToTags(niche: string): Array<{ k: string; v: string }> | null {
  const norm = niche.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  // match exato
  if (NICHE_TO_OSM[norm]) return NICHE_TO_OSM[norm];
  // match parcial (procura keys que contém ou que estão contidas)
  for (const key of Object.keys(NICHE_TO_OSM)) {
    if (key.includes(norm) || norm.includes(key)) return NICHE_TO_OSM[key];
  }
  return null;
}

type OverpassElement = { name: string | null; phone: string | null; website: string | null; addr: string | null };
type OverpassResult = { elements: OverpassElement[]; rawCount: number };

// =============================================================================
// TELELISTAS — fonte complementar pra cidades médias/pequenas
// OSM cobre bem capitais; Telelistas cobre o resto (Campinas, Sorocaba, etc).
// =============================================================================

function citySlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Busca empresas no Telelistas por (UF, cidade, nicho).
 * Retorna telefones normalizados + nomes (quando inferíveis do JSON-LD da página).
 * Falha silenciosamente: 410/404/timeout retornam [].
 */
async function queryTelelistas(uf: string, city: string, niche: string): Promise<OverpassElement[]> {
  const ufLower = uf.toLowerCase();
  const slug = citySlug(city);
  // Telelistas redireciona alias de nicho automaticamente (ex: "academia" → "academias+desportivas").
  const nicheSlug = niche.toLowerCase().replace(/\s+/g, '+');
  const url = `https://www.telelistas.net/${ufLower}/${slug}/${nicheSlug}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });
    if (!res.ok) {
      console.log(JSON.stringify({ level: 'info', msg: 'telelistas_skipped', url, status: res.status }));
      return [];
    }
    const html = await res.text();

    // Extrai nomes via JSON-LD ItemList (URLs no padrão .../bu-NNNN/{name+slug}+em+{bairro})
    const names = new Map<number, string>();
    const ldMatches = html.match(/<script type="application\/ld\+json">\s*\{[^]*?"@type":"ItemList"[^]*?\}\s*<\/script>/);
    if (ldMatches) {
      try {
        const json = JSON.parse(ldMatches[0].replace(/<\/?script[^>]*>/g, '').trim());
        const items: any[] = Array.isArray(json.itemListElement) ? json.itemListElement : [];
        for (const it of items) {
          const u = String(it?.url || '');
          // Match bu-{ID}/{NAME_SLUG}+em+{BAIRRO}
          const m = u.match(/\/bu-\d+\/([^/]+)$/);
          if (m && typeof it.position === 'number') {
            const nameSlug = m[1].split('+em+')[0].replace(/\+/g, ' ');
            names.set(it.position, nameSlug.replace(/\b\w/g, (c) => c.toUpperCase()));
          }
        }
      } catch {}
    }

    // Extrai telefones do HTML em ordem de aparição.
    // Cada empresa costuma ter 1-2 telefones próximos; vamos pegar todos únicos.
    const phoneRegex = /\((\d{2})\)\s*(\d{4,5})-?(\d{4})/g;
    const seen = new Set<string>();
    const elements: OverpassElement[] = [];
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = phoneRegex.exec(html)) !== null) {
      const raw = `(${m[1]}) ${m[2]}-${m[3]}`;
      const key = `${m[1]}${m[2]}${m[3]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      idx += 1;
      elements.push({
        name: names.get(idx) || null,
        phone: raw,
        website: null,
        addr: null,
      });
    }
    console.log(JSON.stringify({ level: 'info', msg: 'telelistas_ok', url, phones: elements.length }));
    return elements;
  } catch (err: any) {
    console.log(JSON.stringify({ level: 'warn', msg: 'telelistas_error', url, err: err?.message || String(err) }));
    return [];
  }
}

async function queryOverpass(bbox: string, tags: Array<{ k: string; v: string }>): Promise<OverpassResult> {
  // 1 query única buscando TODOS os negócios do nicho na bbox.
  // Filtramos por phone client-side pra também saber quantos existem mas sem phone (UX honesta).
  const blocks = tags.map(t => `nwr["${t.k}"="${t.v}"](${bbox});`).join('');
  const query = `[out:json][timeout:20];(${blocks});out center 150;`;

  // Race em paralelo: dispara todos os mirrors. Resolve no PRIMEIRO que retornar 200.
  // (Não rejeitamos resposta vazia aqui — pra cidades pequenas vazio É a resposta correta.)
  const attempts = OVERPASS_MIRRORS.map(async (mirror) => {
    const url = mirror + '?data=' + encodeURIComponent(query);
    const res = await fetch(url, {
      headers: { 'User-Agent': OVERPASS_UA },
      signal: AbortSignal.timeout(22000),
    });
    if (!res.ok) throw new Error(`${mirror}: HTTP ${res.status}`);
    const data: any = await res.json();
    if (!data?.elements || !Array.isArray(data.elements)) throw new Error(`${mirror}: bad shape`);
    return { mirror, els: data.elements as any[] };
  });

  try {
    const { mirror, els } = await Promise.any(attempts);
    const mapped: OverpassElement[] = els.map((e: any) => ({
      name: e.tags?.name || e.tags?.['brand'] || null,
      phone: e.tags?.phone || e.tags?.['contact:phone'] || null,
      website: e.tags?.website || e.tags?.['contact:website'] || null,
      addr: [e.tags?.['addr:street'], e.tags?.['addr:housenumber'], e.tags?.['addr:suburb'], e.tags?.['addr:city']].filter(Boolean).join(', ') || null,
    }));
    const withPhone = mapped.filter((e) => e.phone);
    console.log(JSON.stringify({ level: 'info', msg: 'overpass_ok', mirror, raw: mapped.length, with_phone: withPhone.length }));
    return { elements: withPhone, rawCount: mapped.length };
  } catch (err: any) {
    const errs = err?.errors?.map((e: any) => e?.message || String(e)) || [String(err)];
    console.log(JSON.stringify({ level: 'warn', msg: 'overpass_all_failed', errors: errs }));
    return { elements: [], rawCount: 0 };
  }
}

// ----- SearXNG (meta-buscador open-source, instances públicas grátis) --------
// Rotaciona entre múltiplas instances pra distribuir carga e mitigar bloqueios.
const SEARXNG_INSTANCES = [
  'https://searx.be',
  'https://search.disroot.org',
  'https://baresearch.org',
  'https://priv.au',
  'https://searx.tiekoetter.com',
  'https://search.inetol.net',
];

async function searchSearxng(query: string): Promise<{ urls: string[]; instanceUsed: string | null }> {
  // Tenta cada instance até uma responder com resultados
  for (const base of SEARXNG_INSTANCES) {
    try {
      const url = `${base}/search?q=${encodeURIComponent(query)}&format=json&language=pt-BR&safesearch=0`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const data: any = await res.json();
      const urls: string[] = [];
      for (const r of data?.results || []) {
        if (r?.url) urls.push(r.url);
      }
      if (urls.length > 0) {
        return { urls: urls.filter(isUsableUrl), instanceUsed: base };
      }
    } catch {
      continue;
    }
  }
  return { urls: [], instanceUsed: null };
}

// WA explicit (alta confiança — número definitivamente em uso no WhatsApp)
const WA_PATTERN = /(?:wa\.me|api\.whatsapp\.com\/send\?phone=|chat\.whatsapp\.com\/?\?phone=|whatsapp:)[\/=]?(\+?\d[\d\s\-()]{8,18})/gi;
const URL_WA_PATTERN = /wa\.me\/(\+?\d{10,15})/gi;
// Phone genérico (baixa confiança — pode ser fixo, antigo, não-WA)
const LOOSE_PHONE_PATTERN = /(?<![\w\d])(\+?55\s?\(?\d{2}\)?\s?\d{4,5}-?\d{4})/g;
const TEL_HREF_PATTERN = /tel:\+?(\d{10,15})/gi;

export type PhoneSource = 'wa_link' | 'phone_pattern';

/**
 * Normaliza pra BR. Aceita móvel (11 dígitos, 9 na 3ª pos) e fixo (10 dígitos).
 * Retorna { phone, isMobile } — fixos podem ser WhatsApp Business, então não filtramos cego.
 * Recusa estrangeiros e formatos inválidos.
 */
function normalizeBRPhone(raw: string): { phone: string; isMobile: boolean } | null {
  let d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('0')) d = d.slice(1);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = parseInt(d.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) return null;
  const isMobile = d.length === 11 && d[2] === '9';
  if (d.length === 11 && !isMobile) return null; // 11 dígitos sem 9 = inválido
  return { phone: '55' + d, isMobile };
}

/**
 * @deprecated mantido pra retrocompat com extractPhonesFromText. Use normalizeBRPhone.
 */
function normalizeBRMobile(raw: string): string | null {
  const r = normalizeBRPhone(raw);
  return r && r.isMobile ? r.phone : null;
}

function buildQueries(keyword: string): string[] {
  const kw = keyword.trim();
  return [
    `${kw} wa.me`,
    `${kw} whatsapp contato`,
    `${kw} "api.whatsapp.com/send"`,
    `${kw} agendamento whatsapp`,
    `${kw} linktr.ee whatsapp`,
  ];
}

// Bing usa ck/a?...&u=a1<base64-da-url-real>. Decodifica.
function decodeBingRedirect(href: string): string | null {
  const m = href.match(/u=a1([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    return Buffer.from(b64, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

// Cite do Bing exibe URL como "https://dominio › path › sub" (truncado). Reconstrói parcial.
function parseCiteUrl(text: string): string | null {
  const cleaned = text.replace(/\s*›\s*/g, '/').replace(/…$/, '').trim();
  if (cleaned.startsWith('http')) return cleaned;
  return null;
}

// ----- Bing -------------------------------------------------------------------
async function searchBing(query: string): Promise<string[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=30&setlang=pt-BR&cc=BR`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const links: string[] = [];

    // Bing 2026: h2 a → ck/a?u=a1<base64>
    $('li.b_algo, .b_algo').each((_, item) => {
      const $item = $(item);
      const href = $item.find('h2 a').first().attr('href') || '';
      const decoded = decodeBingRedirect(href);
      if (decoded) {
        links.push(decoded);
        return;
      }
      // Fallback: cite mostra URL parcial
      const citeText = $item.find('cite').first().text();
      const fromCite = parseCiteUrl(citeText);
      if (fromCite) links.push(fromCite);
    });

    // Fallback global: qualquer anchor http(s) que não seja bing.com
    if (links.length === 0) {
      $('a[href^="http"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (!href.includes('bing.com') && !href.includes('microsoft.com')) links.push(href);
      });
    }

    return Array.from(new Set(links)).filter((u) => isUsableUrl(u));
  } catch {
    return [];
  }
}

// Filtra URLs úteis: exclui search engines e CDNs/imagens.
function isUsableUrl(u: string): boolean {
  if (!u.startsWith('http')) return false;
  if (/bing\.com|microsoft\.com|google\.com|googleusercontent|duckduckgo\.com/i.test(u)) return false;
  if (/\.(jpg|jpeg|png|gif|webp|svg|css|js|ico|pdf|zip)(\?|$)/i.test(u)) return false;
  return true;
}

// ----- DuckDuckGo HTML version (não-JS) --------------------------------------
async function searchDuckDuckGo(query: string): Promise<string[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=br-pt`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      body: `q=${encodeURIComponent(query)}&kl=br-pt`,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const links: string[] = [];
    $('a.result__a, .result__title a').each((_, el) => {
      const href = $(el).attr('href') || '';
      // DDG envolve em /l/?uddg=...
      const m = href.match(/uddg=([^&]+)/);
      if (m) {
        try { links.push(decodeURIComponent(m[1])); } catch {}
      } else if (href.startsWith('http')) {
        links.push(href);
      }
    });
    return Array.from(new Set(links)).filter((u) => isUsableUrl(u));
  } catch {
    return [];
  }
}

type PhoneHit = { phone: string; source: PhoneSource };

/**
 * Extrai phones com source. wa.me e api.whatsapp.com = wa_link (alta confiança).
 * Regex genérico/tel: = phone_pattern (baixa, pode ser fixo).
 */
function extractPhonesFromText(text: string): PhoneHit[] {
  const out = new Map<string, PhoneSource>(); // phone → melhor source vista

  function add(raw: string, source: PhoneSource) {
    const norm = normalizeBRMobile(raw);
    if (!norm) return;
    // Se já visto, só upgrade se vier source melhor (wa_link > phone_pattern)
    const cur = out.get(norm);
    if (!cur || (source === 'wa_link' && cur !== 'wa_link')) out.set(norm, source);
  }

  // High-confidence (links explícitos de WhatsApp)
  for (const re of [WA_PATTERN, URL_WA_PATTERN]) {
    const rx = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) add(m[1], 'wa_link');
  }
  // Low-confidence (regex genérico)
  for (const re of [LOOSE_PHONE_PATTERN, TEL_HREF_PATTERN]) {
    const rx = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) add(m[1], 'phone_pattern');
  }
  return Array.from(out.entries()).map(([phone, source]) => ({ phone, source }));
}

async function fetchPageAndExtract(url: string): Promise<{ phones: PhoneHit[]; title: string | null; blocked: boolean }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      return { phones: [], title: null, blocked: res.status === 403 || res.status === 429 };
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const title = $('title').first().text()
      || $('meta[property="og:title"]').attr('content')
      || $('meta[name="title"]').attr('content')
      || null;

    const hrefs: string[] = [];
    $('a').each((_, el) => { const h = $(el).attr('href'); if (h) hrefs.push(h); });
    const text = $.root().text() + ' ' + hrefs.join(' ');
    const phones = extractPhonesFromText(text);
    return { phones, title: title?.trim() || null, blocked: false };
  } catch {
    return { phones: [], title: null, blocked: false };
  }
}

export type ScrapeDiagnostics = {
  inserted: number;
  total_found: number;
  keyword: string;
  niche_matched: string | null;
  city: string | null;
  source: 'overpass' | 'searxng' | 'mixed' | 'none';
  overpass_results: number;
  // Quantos negócios desse nicho existem no OSM da região (incluindo sem telefone).
  // Útil pra UX: "achei 5 academias mas só 1 tem telefone" vs "não tem academia nessa cidade".
  raw_osm_count: number;
  // Telefones encontrados no Telelistas (já filtrado por mobile/fixo BR).
  telelistas_results: number;
};

/**
 * Captura automática via OpenStreetMap Overpass API.
 * Mapeia nicho amigável → tags OSM (shop=beauty, amenity=clinic, etc).
 * Mapeia cidade → bounding box.
 * Funciona sem cadastro, sem captcha, sem cartão. Fonte aberta com dados reais.
 */
export async function scrapeLeads(ctx: AuthContext, input: unknown): Promise<ScrapeDiagnostics> {
  const parsed = scrapeSchema.parse(input);
  const tenantId = resolveTargetTenant(ctx, parsed.tenant_id);

  const niche = parsed.niche.trim();
  const stateUf = parsed.state.trim().toUpperCase();
  const cityName = parsed.city.trim();

  const stateInfo = BR_STATES.find((s) => s.uf === stateUf);
  if (!stateInfo) {
    throw new AppError(`Estado "${stateUf}" inválido.`, { status: 400 });
  }

  const tags = nicheToTags(niche);
  if (!tags) {
    throw new AppError(
      `Nicho "${niche}" não mapeado. Use um dos nichos da lista (ex: estética, clínica, restaurante, advocacia).`,
      { status: 400 },
    );
  }

  const bbox = await resolveCityBbox(cityName, stateUf);
  if (!bbox) {
    throw new AppError(
      `Não consegui localizar "${cityName}/${stateUf}" no mapa. Tente outra cidade ou verifique a grafia.`,
      { status: 400 },
    );
  }

  // Dispara OSM (Overpass) e Telelistas em paralelo. Cada fonte cobre lacunas da outra:
  // OSM = forte em capitais; Telelistas = forte em cidades médias/pequenas.
  const [osmResult, telElements] = await Promise.all([
    queryOverpass(bbox, tags),
    queryTelelistas(stateUf, cityName, niche),
  ]);
  const { elements: osmElements, rawCount } = osmResult;

  // Normaliza e dedup. Aceita móvel e fixo (fixo pode ser WhatsApp Business — user filtra via badge).
  const byPhone = new Map<string, { name: string | null; url: string | null; isMobile: boolean; from: 'osm' | 'telelistas' }>();
  function addElement(e: OverpassElement, from: 'osm' | 'telelistas') {
    if (!e.phone) return;
    const r = normalizeBRPhone(e.phone);
    if (!r) return;
    if (byPhone.has(r.phone)) return;
    byPhone.set(r.phone, { name: e.name, url: e.website, isMobile: r.isMobile, from });
  }
  for (const e of osmElements) addElement(e, 'osm');
  for (const e of telElements) addElement(e, 'telelistas');

  const cityLabel = `${cityName}/${stateUf}`;
  const osmKept = Array.from(byPhone.values()).filter((v) => v.from === 'osm').length;
  const telKept = byPhone.size - osmKept;

  const sourceLabel: ScrapeDiagnostics['source'] =
    byPhone.size === 0 ? 'none'
    : (osmKept > 0 && telKept > 0) ? 'mixed'
    : (osmKept > 0 ? 'overpass' : 'searxng'); // 'searxng' reaproveitado pra "telelistas-only"

  const diagnostics: ScrapeDiagnostics = {
    inserted: 0,
    total_found: byPhone.size,
    keyword: `${niche} em ${cityLabel}`,
    niche_matched: tags.map((t) => `${t.k}=${t.v}`).join(','),
    city: cityLabel,
    source: sourceLabel,
    overpass_results: osmKept,
    raw_osm_count: rawCount,
    telelistas_results: telKept,
  };

  if (byPhone.size === 0) {
    console.log(JSON.stringify({ level: 'info', msg: 'prospecting_no_results', ...diagnostics }));
    return diagnostics;
  }

  // Aplica limite de captura definido pelo user (default 50, max 200).
  const maxLeads = parsed.max_leads ?? 50;
  const limitedEntries = Array.from(byPhone.entries()).slice(0, maxLeads);

  const rows = limitedEntries.map(([phone, info]) => ({
    tenant_id: tenantId,
    name: info.name,
    whatsapp_number: phone,
    keyword_used: `${niche} · ${cityLabel}`,
    source_url: info.url,
    status: 'pending' as const,
    // source: 'phone_pattern' (= badge "tel") em ambas as fontes. wa_link só pra links explícitos.
    // Fixos vs móveis registrados em is_mobile pra futuro filtro.
    metadata: { source: 'phone_pattern' as PhoneSource, origin: info.from, osm_niche: niche, osm_state: stateUf, osm_city: cityName, is_mobile: info.isMobile },
  }));

  // Atualiza total_found pra refletir o que será de fato inserido (após limite)
  diagnostics.total_found = rows.length;

  const { data, error } = await supabaseAdmin
    .from('prospecting_leads')
    .upsert(rows, { onConflict: 'tenant_id,whatsapp_number', ignoreDuplicates: true })
    .select('id');
  if (error) throw new AppError(`Falha ao salvar leads: ${error.message}`, { status: 500 });

  diagnostics.inserted = data?.length || 0;

  console.log(JSON.stringify({ level: 'info', msg: 'prospecting_scrape_done', ...diagnostics }));
  return diagnostics;
}

/**
 * Extrai números a partir de URLs coladas pelo usuário.
 * Modo "manual" — não depende de search engine, funciona sempre.
 * Usuário busca no navegador (não bloqueado) → cola URLs aqui → backend extrai phones.
 */
export type ExtractDiagnostics = {
  inserted: number;
  total_found: number;
  urls_processed: number;
  urls_failed: number;
  keyword: string | null;
};

export async function extractFromUrls(ctx: AuthContext, input: unknown): Promise<ExtractDiagnostics> {
  const parsed = extractUrlsSchema.parse(input);
  const tenantId = ctx.profile.tenant_id;
  if (!tenantId) {
    throw new AppError(
      'Você está logado como admin global. Faça login como cliente pra capturar leads.',
      { status: 403 },
    );
  }

  const urls = Array.from(new Set(parsed.urls.filter(isUsableUrl)));
  if (urls.length === 0) {
    return { inserted: 0, total_found: 0, urls_processed: 0, urls_failed: 0, keyword: parsed.keyword || null };
  }

  // Fetch em paralelo (limitado pelo browser do server)
  const results = await Promise.all(urls.map((u) => fetchPageAndExtract(u)));
  const urlsFailed = results.filter((r) => r.phones.length === 0 && r.title === null).length;

  // Consolida byPhone com source
  const byPhone = new Map<string, { name: string | null; url: string; source: PhoneSource }>();
  function addPhone(hit: PhoneHit, name: string | null, url: string) {
    const cur = byPhone.get(hit.phone);
    if (!cur || (hit.source === 'wa_link' && cur.source !== 'wa_link')) {
      byPhone.set(hit.phone, { name: name || cur?.name || null, url: url || cur?.url || '', source: hit.source });
    }
  }
  // Phones direto das URLs (wa.me)
  for (const hit of extractPhonesFromText(urls.join(' '))) addPhone(hit, null, '');
  results.forEach((r, i) => {
    for (const hit of r.phones) addPhone(hit, r.title, urls[i]);
  });

  if (byPhone.size === 0) {
    return {
      inserted: 0,
      total_found: 0,
      urls_processed: urls.length,
      urls_failed: urlsFailed,
      keyword: parsed.keyword || null,
    };
  }

  const rows = Array.from(byPhone.entries()).map(([phone, info]) => ({
    tenant_id: tenantId,
    name: info.name,
    whatsapp_number: phone,
    keyword_used: parsed.keyword || null,
    source_url: info.url || null,
    status: 'pending' as const,
    metadata: { source: info.source },
  }));

  const { data, error } = await supabaseAdmin
    .from('prospecting_leads')
    .upsert(rows, { onConflict: 'tenant_id,whatsapp_number', ignoreDuplicates: true })
    .select('id');
  if (error) throw new AppError(`Falha ao salvar leads: ${error.message}`, { status: 500 });

  return {
    inserted: data?.length || 0,
    total_found: byPhone.size,
    urls_processed: urls.length,
    urls_failed: urlsFailed,
    keyword: parsed.keyword || null,
  };
}

// =============================================================================
// LISTAGEM / SETTINGS
// =============================================================================

/**
 * Resolve qual tenant_id usar pra ações de prospecção.
 * - Cliente comum: usa o tenant_id próprio do user (ignora override).
 * - Admin: requer override explícito (acting on behalf of a tenant).
 */
function resolveTargetTenant(ctx: AuthContext, requestedTenantId?: string | null): string {
  if (ctx.profile.role === 'admin') {
    if (!requestedTenantId) {
      throw new AppError('Admin precisa selecionar um cliente antes (tenant_id).', { status: 400 });
    }
    return requestedTenantId;
  }
  if (!ctx.profile.tenant_id) {
    throw new AppError('Usuário sem vínculo com tenant.', { status: 403 });
  }
  return ctx.profile.tenant_id;
}

/**
 * Cria um lead manual (não-prospectado) na tabela prospecting_leads.
 * Útil pra cadastrar leads conhecidos sem rodar scraping.
 */
export async function createManualLead(
  ctx: AuthContext,
  input: { name?: string | null; phone: string; niche: string; city?: string | null; tenant_id?: string | null },
): Promise<{ lead: any; created: boolean }> {
  const tenantId = resolveTargetTenant(ctx, input.tenant_id);
  const r = normalizeBRPhone(input.phone);
  if (!r) {
    throw new AppError('Número inválido. Use formato BR (ex: 11 99999-9999 ou +55 11 99999-9999).', { status: 400 });
  }

  const niche = input.niche.trim();
  const city = (input.city || '').trim();
  const name = (input.name || '').trim() || null;
  const keyword = city ? `${niche} · ${city}` : niche;

  // Tenta inserir; dedup por (tenant_id, whatsapp_number)
  const { data: existing } = await supabaseAdmin
    .from('prospecting_leads')
    .select('id, name, status')
    .eq('tenant_id', tenantId)
    .eq('whatsapp_number', r.phone)
    .maybeSingle();

  if (existing) {
    return { lead: existing, created: false };
  }

  const { data, error } = await supabaseAdmin
    .from('prospecting_leads')
    .insert({
      tenant_id: tenantId,
      name,
      whatsapp_number: r.phone,
      keyword_used: keyword,
      status: 'pending' as const,
      source_url: null,
      metadata: {
        source: 'phone_pattern' as PhoneSource,
        origin: 'manual',
        is_mobile: r.isMobile,
        osm_niche: niche,
        osm_city: city || null,
      },
    })
    .select('*')
    .single();
  if (error) throw new AppError(error.message, { status: 500 });
  return { lead: data, created: true };
}

export async function listProspectingLeads(
  ctx: AuthContext,
  opts: { limit?: number; status?: string | null; tenantId?: string | null } = {},
) {
  const tenantId = resolveTargetTenant(ctx, opts.tenantId);
  const limit = Math.min(opts.limit || 200, 500);
  let q = supabaseAdmin
    .from('prospecting_leads')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (opts.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw new AppError(error.message, { status: 500 });
  return { leads: data || [] };
}

export async function deleteProspectingLead(
  ctx: AuthContext,
  leadId: string,
  opts: { tenantId?: string | null } = {},
): Promise<void> {
  const isAdmin = ctx.profile.role === 'admin';

  // Admin pode deletar sem precisar selecionar tenant; membro precisa do tenant_id próprio.
  let query = supabaseAdmin
    .from('prospecting_leads')
    .delete({ count: 'exact' })
    .eq('id', leadId);

  if (!isAdmin) {
    const tenantId = resolveTargetTenant(ctx, opts.tenantId);
    query = query.eq('tenant_id', tenantId);
  } else if (opts.tenantId) {
    // Admin com tenant explícito — escopo seguro
    query = query.eq('tenant_id', opts.tenantId);
  }

  const { error, count } = await query;
  if (error) throw new AppError(error.message, { status: 500 });
  if (!count) throw new AppError('Lead não encontrado.', { status: 404 });
}

export async function getProspectingStats(ctx: AuthContext, opts: { tenantId?: string | null } = {}) {
  // Quando admin sem cliente selecionado, retorna stats zeradas (UI pede pra escolher cliente).
  let tenantId: string;
  try {
    tenantId = resolveTargetTenant(ctx, opts.tenantId);
  } catch {
    return { total: 0, pending: 0, sending: 0, sent: 0, failed: 0 };
  }

  const { data, error } = await supabaseAdmin
    .from('prospecting_leads')
    .select('status')
    .eq('tenant_id', tenantId);
  if (error) throw new AppError(error.message, { status: 500 });

  const counts = { total: 0, pending: 0, sending: 0, sent: 0, failed: 0 };
  for (const row of data || []) {
    counts.total += 1;
    const s = (row as any).status as keyof typeof counts;
    if (s in counts) counts[s] += 1;
  }
  return counts;
}

export async function getProspectingSettings(ctx: AuthContext) {
  const tenantId = ctx.profile.tenant_id;
  // Admin global (sem tenant) — devolve defaults vazios pra UI não quebrar.
  if (!tenantId) {
    return {
      tenant_id: null,
      max_leads_per_day: 20,
      min_delay_minutes: 3,
      max_delay_minutes: 10,
      whatsapp_instances: [],
      ai_script: null,
    };
  }

  const { data, error } = await supabaseAdmin
    .from('prospecting_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new AppError(error.message, { status: 500 });

  return data ?? {
    tenant_id: tenantId,
    max_leads_per_day: 20,
    min_delay_minutes: 3,
    max_delay_minutes: 10,
    whatsapp_instances: [],
    ai_script: null,
  };
}

export async function saveProspectingSettings(ctx: AuthContext, input: unknown) {
  const parsed = prospectingSettingsSchema.parse(input);
  const tenantId = ctx.profile.tenant_id;
  if (!tenantId) throw new AppError('Você está logado como admin global. Faça login como cliente pra configurar prospecção.', { status: 403 });

  const row = {
    tenant_id: tenantId,
    ...(parsed.max_leads_per_day !== undefined ? { max_leads_per_day: parsed.max_leads_per_day } : {}),
    ...(parsed.min_delay_minutes !== undefined ? { min_delay_minutes: parsed.min_delay_minutes } : {}),
    ...(parsed.max_delay_minutes !== undefined ? { max_delay_minutes: parsed.max_delay_minutes } : {}),
    ...(parsed.whatsapp_instances !== undefined ? { whatsapp_instances: parsed.whatsapp_instances } : {}),
    ...(parsed.ai_script !== undefined ? { ai_script: parsed.ai_script } : {}),
  };

  const { data, error } = await supabaseAdmin
    .from('prospecting_settings')
    .upsert(row, { onConflict: 'tenant_id' })
    .select('*')
    .single();
  if (error) throw new AppError(`Falha ao salvar settings: ${error.message}`, { status: 500 });
  return data;
}
