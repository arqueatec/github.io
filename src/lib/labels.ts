export const CATEGORY_LABEL: Record<string, string> = {
  matriz: "Matriz",
  reprodutor: "Reprodutor",
  cordeiro: "Cordeiro(a)",
  borrego: "Borrego(a)",
  descarte: "Descarte",
};
export function categoryLabel(cat: string, sex?: "M" | "F") {
  if (sex && cat === "cordeiro") return sex === "F" ? "Cordeira" : "Cordeiro";
  if (sex && cat === "borrego") return sex === "F" ? "Borrega" : "Borrego";
  return CATEGORY_LABEL[cat] ?? cat;
}
export const STATUS_LABEL: Record<string, string> = {
  ativo: "Ativo",
  vendido: "Vendido",
  morto: "Morto",
  abatido: "Abatido",
  consumo_proprio: "Consumo próprio",
};
export const SEX_LABEL: Record<string, string> = { M: "Macho", F: "Fêmea" };
export const HEALTH_LABEL: Record<string, string> = {
  vacina: "Vacina",
  vermifugacao: "Vermifugação",
  tratamento: "Tratamento",
  outro: "Outro",
};
export const EXIT_LABEL: Record<string, string> = {
  venda: "Venda",
  morte: "Morte",
  abate: "Abate",
  consumo_proprio: "Consumo próprio",
};
export const PREG_LABEL: Record<string, string> = { prenhe: "Prenhe", vazia: "Vazia", duvidosa: "Duvidosa" };
export const METHOD_LABEL: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
  boleto: "Boleto",
  outro: "Outro",
};
export const BIRTH_TYPE_LABEL: Record<string, string> = {
  normal: "Normal",
  assistido: "Assistido",
  cesariana: "Cesariana",
  aborto: "Aborto",
};
export const ORIGIN_LABEL: Record<string, string> = {
  inventario: "Inventário inicial",
  nascimento: "Nascido no rebanho",
  compra: "Compra",
  importacao: "Importação de planilha",
};
export const PARTY_LABEL = { A: "Parte A", B: "Parte B" } as const;
