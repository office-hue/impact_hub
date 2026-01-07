import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// A data mappa a repo gyökerében van, nem az ai-agent-core alatt.
const ngoCategories = require('../../../../data/ngo-category-map.json');

export type NgoCategory = 'children' | 'education' | 'health' | 'environment' | 'animals' | 'other';
export type NgoCategoryMatch = {
  category: {
    id: string;
    title: string;
    synonyms?: string[];
    ngos: { slug: string; name: string; mission?: string; impact_focus?: string; cta_url?: string; fillout_url?: string }[];
  };
};

const NGO_CATEGORY_MAP = new Map<string, NgoCategory>();
const NGO_CATEGORY_ENTRIES: NgoCategoryMatch['category'][] = [];

function loadNgoCategories(): void {
  // If the JSON is an array of category objects
  if (Array.isArray(ngoCategories)) {
    for (const category of ngoCategories as any[]) {
      if (!category?.ngos) {
        continue;
      }
      const catId = category.id || category.title || 'other';
      const catTitle = category.title || category.id || 'Kategória';
      const cat: NgoCategoryMatch['category'] = {
        id: String(catId),
        title: String(catTitle),
        synonyms: Array.isArray(category.synonyms) ? category.synonyms.map((s: string) => String(s).toLowerCase()) : undefined,
        ngos: [],
      };
      for (const ngo of category.ngos) {
        const slug = String(ngo.slug || '').trim();
        if (!slug) continue;
        const catValue: NgoCategory = (category.category as NgoCategory) || 'other';
        NGO_CATEGORY_MAP.set(slug, catValue);
        cat.ngos.push({
          slug,
          name: ngo.name || slug,
          mission: ngo.mission,
          impact_focus: ngo.impact_focus,
          cta_url: ngo.cta_url,
          fillout_url: ngo.fillout_url,
        });
      }
      if (cat.ngos.length) {
        NGO_CATEGORY_ENTRIES.push(cat);
      }
    }
    return;
  }

  // If the JSON has a top-level categories field
  if (Array.isArray((ngoCategories as any).categories)) {
    for (const category of (ngoCategories as any).categories) {
      if (!category?.ngos) {
        continue;
      }
      const catId = category.id || category.title || 'other';
      const catTitle = category.title || category.id || 'Kategória';
      const cat: NgoCategoryMatch['category'] = {
        id: String(catId),
        title: String(catTitle),
        synonyms: Array.isArray(category.synonyms) ? category.synonyms.map((s: string) => String(s).toLowerCase()) : undefined,
        ngos: [],
      };
      for (const ngo of category.ngos) {
        const slug = String(ngo.slug || '').trim();
        if (!slug) continue;
        const catValue: NgoCategory = (category.category as NgoCategory) || 'other';
        NGO_CATEGORY_MAP.set(slug, catValue);
        cat.ngos.push({
          slug,
          name: ngo.name || slug,
          mission: ngo.mission,
          impact_focus: ngo.impact_focus,
          cta_url: ngo.cta_url,
          fillout_url: ngo.fillout_url,
        });
      }
      if (cat.ngos.length) {
        NGO_CATEGORY_ENTRIES.push(cat);
      }
    }
    return;
  }

  // Fallback: legacy map shape { "bator-tabor": { "category": "children", "name": "...", ... } }
  Object.entries(ngoCategories as Record<string, any>).forEach(([slug, data]) => {
    const catValue: NgoCategory = (data.category as NgoCategory) || 'other';
    NGO_CATEGORY_MAP.set(slug, catValue);
    NGO_CATEGORY_ENTRIES.push({
      id: catValue,
      title: data.title || slug,
      ngos: [
        {
          slug,
          name: data.name || slug,
          mission: data.mission,
          impact_focus: data.impact_focus,
          cta_url: data.cta_url,
          fillout_url: data.fillout_url,
        },
      ],
    });
  });
}

loadNgoCategories();

export function getNgoCategory(slug?: string): NgoCategory | undefined {
  if (!slug) return undefined;
  return NGO_CATEGORY_MAP.get(slug);
}

export async function matchNgoCategory(query: string): Promise<NgoCategoryMatch | null> {
  const normalized = query.toLowerCase();
  const keywords = normalized.split(/\s+/);
  const filteredKeywords = keywords.filter(word => word.length >= 3);
  const matchedCategory = NGO_CATEGORY_ENTRIES.find(cat =>
    filteredKeywords.some(
      word =>
        cat.title.toLowerCase().includes(word) ||
        cat.id.toLowerCase().includes(word) ||
        (cat.synonyms && cat.synonyms.some(syn => syn.includes(word))),
    ),
  );
  if (matchedCategory) {
    return { category: matchedCategory };
  }
  // Heuristic: children/education intent
  const isChildren =
    normalized.includes('gyerek') ||
    normalized.includes('oktatas') ||
    normalized.includes('oktatás') ||
    normalized.includes('gyermek') ||
    normalized.includes('iskola') ||
    normalized.includes('tanulás') ||
    normalized.includes('tanulas') ||
    normalized.includes('education') ||
    normalized.includes('children');
  if (isChildren) {
    const fallbackChildren =
      NGO_CATEGORY_ENTRIES.find(cat => cat.id.includes('gyermek') || cat.id.includes('oktatas') || cat.id === 'children') ||
      NGO_CATEGORY_ENTRIES.find(cat => (cat.synonyms || []).some(syn => syn.includes('oktat') || syn.includes('gyerek'))) ||
      NGO_CATEGORY_ENTRIES[0];
    return fallbackChildren ? { category: fallbackChildren } : null;
  }
  return null;
}
