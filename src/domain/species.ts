/**
 * Configuração por espécie (ovino × bovino) — fonte única da verdade para
 * categorias, gestação e promoções. Funções puras, sem acesso a banco nem UI.
 */

export type Species = "ovino" | "bovino";
export const SPECIES: Species[] = ["ovino", "bovino"];

export type Category =
  | "matriz"
  | "reprodutor"
  | "cordeiro"
  | "borrego"
  | "descarte"
  | "vaca"
  | "touro"
  | "bezerro"
  | "novilho"
  | "garrote"
  | "boi";

/** Todas as categorias existentes no enum do banco (ovino + bovino). */
export const ALL_CATEGORIES: Category[] = [
  "matriz",
  "reprodutor",
  "cordeiro",
  "borrego",
  "descarte",
  "vaca",
  "touro",
  "bezerro",
  "novilho",
  "garrote",
  "boi",
];

export interface SpeciesConfig {
  /** Duração média da gestação, em dias. */
  gestationDays: number;
  /** Categorias exibidas para esta espécie, na ordem do formulário/efetivo. */
  categories: Category[];
  /** Categorias consideradas "adulto" (para mortalidade de adultos). */
  adult: Category[];
  /** Fêmea reprodutora (matriz/vaca). */
  femaleAdult: Category;
  /** Macho reprodutor (reprodutor/touro). */
  maleAdult: Category;
  /** Cria em aleitamento (cordeiro/bezerro). */
  young: Category;
  /** Jovem desmamado (borrego/novilho). */
  weaned: Category;
}

export const SPECIES_CONFIG: Record<Species, SpeciesConfig> = {
  ovino: {
    gestationDays: 150,
    categories: ["matriz", "reprodutor", "cordeiro", "borrego", "descarte"],
    adult: ["matriz", "reprodutor", "descarte"],
    femaleAdult: "matriz",
    maleAdult: "reprodutor",
    young: "cordeiro",
    weaned: "borrego",
  },
  bovino: {
    gestationDays: 285,
    categories: ["vaca", "touro", "bezerro", "novilho", "garrote", "boi", "descarte"],
    adult: ["vaca", "touro", "boi", "descarte"],
    femaleAdult: "vaca",
    maleAdult: "touro",
    young: "bezerro",
    weaned: "novilho",
  },
};

export function isSpecies(v: unknown): v is Species {
  return v === "ovino" || v === "bovino";
}

export function speciesOfCategory(cat: Category): Species {
  return SPECIES_CONFIG.bovino.categories.includes(cat) && cat !== "descarte" ? "bovino" : "ovino";
}

export function gestationFor(species: Species): number {
  return SPECIES_CONFIG[species].gestationDays;
}

export function categoriesFor(species: Species): Category[] {
  return SPECIES_CONFIG[species].categories;
}

export function isAdultCategory(species: Species, cat: Category): boolean {
  return SPECIES_CONFIG[species].adult.includes(cat);
}

/** Categorias que uma fêmea pode ter (para formulários). */
export function categoriesForSex(species: Species, sex: "M" | "F"): Category[] {
  const c = SPECIES_CONFIG[species];
  return c.categories.filter((cat) => {
    if (sex === "M" && cat === c.femaleAdult) return false;
    if (sex === "F" && cat === c.maleAdult) return false;
    return true;
  });
}

export function validCategoryForSex(species: Species, cat: Category, sex: "M" | "F"): boolean {
  const c = SPECIES_CONFIG[species];
  if (sex === "M" && cat === c.femaleAdult) return false;
  if (sex === "F" && cat === c.maleAdult) return false;
  return true;
}
