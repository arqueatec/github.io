/** Esquemas de validação (zod) compartilhados entre formulários e servidor. */
import { z } from "zod";
import { isIsoDate } from "@/domain/dates";
import { SPECIES_CONFIG, validCategoryForSex, type Species } from "@/domain/species";
import { CATEGORY_LABEL } from "@/lib/labels";

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

export const isoDate = z.string().refine(isIsoDate, "Data inválida (use AAAA-MM-DD)");
export const optDate = z.preprocess(emptyToNull, isoDate.nullable()).optional();
export const optText = (max = 500) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() || null : emptyToNull(v)), z.string().max(max).nullable()).optional();
export const optInt = z.preprocess(emptyToNull, z.coerce.number().int().positive().nullable()).optional();
export const clientRef = z.preprocess(emptyToNull, z.uuid().nullable()).optional();

export const tagSchema = z
  .string()
  .trim()
  .min(1, "Informe o brinco")
  .max(30, "Brinco muito longo")
  .regex(/^[\p{L}\p{N}\-_. /]+$/u, "Brinco com caracteres inválidos");
export const optTag = z.preprocess((v) => (typeof v === "string" ? v.trim() || null : emptyToNull(v)), tagSchema.nullable()).optional();
/** Pai/mãe: aceita um brinco do rebanho OU um nome/registro livre (animal de fora, PO/pedigree). */
export const optParent = z
  .preprocess((v) => (typeof v === "string" ? v.trim() || null : emptyToNull(v)), z.string().max(80, "Nome muito longo").nullable())
  .optional();

export const cents = z.number().int("Valor deve estar em centavos").positive("Valor deve ser maior que zero").max(100_000_000_00);
/** Valor opcional em centavos (ex.: preço do animal). */
export const optCents = z.preprocess(emptyToNull, z.coerce.number().int().positive().max(100_000_000_00).nullable()).optional();
export const optKg = z.preprocess(emptyToNull, z.coerce.number().min(0).max(500).nullable()).optional();

export const photoSchema = z
  .object({
    mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
    base64: z.string().max(3_000_000, "Foto muito grande (máx. ~2 MB)"),
  })
  .nullable()
  .optional();

export const SEX = ["M", "F"] as const;
export const SPECIES = ["ovino", "bovino"] as const;
export const FINANCE_SPECIES = ["ovino", "bovino", "ambos"] as const;
export const CATEGORY = [
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
] as const;
export const STATUS = ["ativo", "vendido", "morto", "abatido", "consumo_proprio"] as const;
export const ORIGIN = ["inventario", "nascimento", "compra", "importacao"] as const;
export const HEALTH_TYPES = ["vacina", "vermifugacao", "tratamento", "outro"] as const;
export const EXIT_TYPES = ["venda", "morte", "abate", "consumo_proprio"] as const;
export const PREG_RESULTS = ["prenhe", "vazia", "duvidosa"] as const;
export const PAYMENT_METHODS = ["pix", "dinheiro", "transferencia", "boleto", "outro"] as const;
export const BIRTH_TYPES = ["normal", "assistido", "cesariana", "aborto"] as const;

// ---------------------------------------------------------------- Rebanho

export const animalCreateSchema = z
  .object({
    clientRef,
    tag: tagSchema,
    species: z.enum(SPECIES).default("ovino"),
    sex: z.enum(SEX),
    breed: optText(60),
    birthDate: optDate,
    /** Idade estimada em meses quando a data de nascimento é desconhecida. */
    ageMonths: z.preprocess(emptyToNull, z.coerce.number().min(0).max(240).nullable()).optional(),
    birthDateEstimated: z.boolean().optional(),
    motherTag: optParent,
    fatherTag: optParent,
    category: z.enum(CATEGORY),
    lotId: optInt,
    origin: z.enum(ORIGIN).optional(),
    entryDate: optDate,
    priceCents: optCents,
    notes: optText(1000),
    photo: photoSchema,
  })
  .superRefine((v, ctx) => {
    const sp = v.species as Species;
    if (!validCategoryForSex(sp, v.category, v.sex)) {
      const isFemaleCat = v.category === SPECIES_CONFIG[sp].femaleAdult;
      ctx.addIssue({
        code: "custom",
        path: ["category"],
        message: `${CATEGORY_LABEL[v.category] ?? "Essa categoria"} deve ser ${isFemaleCat ? "fêmea" : "macho"}`,
      });
    }
  });
export type AnimalCreate = z.infer<typeof animalCreateSchema>;

export const animalUpdateSchema = z.object({
  tag: tagSchema.optional(),
  sex: z.enum(SEX).optional(),
  breed: optText(60),
  birthDate: optDate,
  birthDateEstimated: z.boolean().optional(),
  motherTag: optParent,
  fatherTag: optParent,
  category: z.enum(CATEGORY).optional(),
  /** Data da mudança de categoria/lote (padrão: hoje). */
  changeDate: optDate,
  lotId: optInt,
  entryDate: optDate,
  priceCents: optCents,
  notes: optText(1000),
  photo: photoSchema,
});
export type AnimalUpdate = z.infer<typeof animalUpdateSchema>;

// ---------------------------------------------------------------- Reprodução

export const breedingCreateSchema = z.object({
  clientRef,
  eweTags: z.array(tagSchema).min(1, "Informe ao menos uma matriz").max(300),
  ramTag: optTag,
  date: isoDate,
  endDate: optDate,
  method: z.enum(["monta_natural", "inseminacao", "monta_controlada"]).default("monta_natural"),
  seasonName: optText(80),
  notes: optText(),
});

export const pregnancyCreateSchema = z.object({
  clientRef,
  eweTag: tagSchema,
  date: isoDate,
  result: z.enum(PREG_RESULTS),
  method: optText(60),
  fetusCount: z.preprocess(emptyToNull, z.coerce.number().int().min(0).max(6).nullable()).optional(),
  notes: optText(),
});

export const birthCreateSchema = z
  .object({
    clientRef,
    eweTag: tagSchema,
    ramTag: optTag,
    date: isoDate,
    bornAlive: z.coerce.number().int().min(0).max(6),
    bornDead: z.coerce.number().int().min(0).max(6),
    birthType: z.enum(BIRTH_TYPES).default("normal"),
    lambs: z
      .array(z.object({ tag: tagSchema, sex: z.enum(SEX), weightKg: optKg }))
      .max(6)
      .default([]),
    lotId: optInt,
    notes: optText(),
  })
  .refine((v) => v.bornAlive + v.bornDead > 0, { message: "Informe ao menos uma cria", path: ["bornAlive"] })
  .refine((v) => v.lambs.length <= v.bornAlive, {
    message: "Há mais crias com brinco do que nascidas vivas",
    path: ["lambs"],
  })
  .refine((v) => new Set(v.lambs.map((l) => l.tag.toLowerCase())).size === v.lambs.length, {
    message: "Brincos de crias repetidos",
    path: ["lambs"],
  });
export type BirthCreate = z.infer<typeof birthCreateSchema>;

export const weaningCreateSchema = z.object({
  clientRef,
  date: isoDate,
  items: z.array(z.object({ tag: tagSchema, weightKg: optKg })).min(1).max(300),
  promoteToBorrego: z.boolean().default(true),
  notes: optText(),
});

// ---------------------------------------------------------------- Sanidade

export const healthCreateSchema = z
  .object({
    clientRef,
    type: z.enum(HEALTH_TYPES),
    date: isoDate,
    product: optText(120),
    dose: optText(60),
    withdrawalDays: z.preprocess(emptyToNull, z.coerce.number().int().min(0).max(365).nullable()).optional(),
    nextDoseDate: optDate,
    notes: optText(),
    lotId: optInt,
    /** Animais (por brinco) com FAMACHA opcional individual. */
    items: z
      .array(z.object({ tag: tagSchema, famacha: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(5).nullable()).optional() }))
      .max(500)
      .default([]),
  })
  .refine((v) => v.items.length > 0 || v.lotId, { message: "Informe os animais ou um lote", path: ["items"] })
  .refine((v) => !v.nextDoseDate || v.nextDoseDate > v.date, {
    message: "A próxima dose deve ser após a data de aplicação",
    path: ["nextDoseDate"],
  });

export const weighingCreateSchema = z.object({
  clientRef,
  date: isoDate,
  items: z
    .array(
      z.object({
        tag: tagSchema,
        weightKg: optKg,
        bodyScore: z.preprocess(emptyToNull, z.coerce.number().min(1).max(5).nullable()).optional(),
      }),
    )
    .min(1)
    .max(500),
  notes: optText(),
});

// ---------------------------------------------------------------- Baixas

export const exitCreateSchema = z.object({
  clientRef,
  tag: tagSchema,
  type: z.enum(["morte", "abate", "consumo_proprio"]),
  date: isoDate,
  cause: optText(200),
  weightKg: optKg,
  ignoreWithdrawal: z.boolean().optional(),
  notes: optText(),
});

export const saleCreateSchema = z
  .object({
    clientRef,
    date: isoDate,
    buyer: z.string().trim().min(1, "Informe o comprador").max(120),
    priceMode: z.enum(["kg", "cabeca"]),
    unitPriceCents: cents,
    items: z.array(z.object({ tag: tagSchema, weightKg: optKg })).min(1).max(300),
    createRevenue: z.boolean().default(true),
    receivedByUserId: optInt,
    ignoreWithdrawal: z.boolean().optional(),
    notes: optText(),
  })
  .refine((v) => v.priceMode !== "kg" || v.items.every((i) => i.weightKg && i.weightKg > 0), {
    message: "Na venda por kg informe o peso de todos os animais",
    path: ["items"],
  });
export type SaleCreate = z.infer<typeof saleCreateSchema>;

// ---------------------------------------------------------------- Finanças

export const EXPENSE_STATUS = ["pago", "a_pagar"] as const;

export const expenseCreateSchema = z
  .object({
    clientRef,
    date: isoDate,
    amountCents: cents,
    categoryId: z.coerce.number().int().positive("Escolha a categoria"),
    description: optText(300),
    /** 'pago' entra no acerto entre as partes; 'a_pagar' é uma conta pendente (vencimento). */
    status: z.enum(EXPENSE_STATUS).default("pago"),
    dueDate: optDate,
    paidByUserId: optInt,
    /**
     * Pagamento parcial / entrada: valor já pago agora (status 'pago'). Sozinho (com `dueDate`)
     * gera 1 saldo a pagar; com `installments`, é a entrada de uma compra parcelada.
     */
    paidNowCents: optCents,
    /** Compra parcelada: parcelas do saldo (cada uma vira uma conta a pagar). */
    installments: z.array(z.object({ amountCents: cents, dueDate: isoDate })).max(60).optional(),
    /** Entradas da compra parcelada: cada uma paga por um usuário (a parte é derivada). */
    downPayments: z.array(z.object({ paidByUserId: z.coerce.number().int().positive(), amountCents: cents })).max(10).optional(),
    species: z.enum(FINANCE_SPECIES).default("ambos"),
    animalTag: optTag,
    lotId: optInt,
    receipt: photoSchema,
  })
  .superRefine((v, ctx) => {
    const hasInst = (v.installments?.length ?? 0) > 0;
    if (hasInst) {
      const downs =
        v.downPayments && v.downPayments.length > 0
          ? v.downPayments
          : v.paidNowCents != null && v.paidNowCents > 0
            ? [{ paidByUserId: v.paidByUserId ?? 0, amountCents: v.paidNowCents }]
            : [];
      const paid = downs.reduce((s, d) => s + d.amountCents, 0);
      if (paid >= v.amountCents)
        ctx.addIssue({ code: "custom", path: ["installments"], message: "A entrada deve ser menor que o total" });
      if (v.paidNowCents != null && v.paidNowCents > 0 && !v.downPayments?.length && !v.paidByUserId)
        ctx.addIssue({ code: "custom", path: ["paidByUserId"], message: "Informe quem pagou a entrada" });
      const sum = v.installments!.reduce((s, p) => s + p.amountCents, 0);
      if (sum !== v.amountCents - paid)
        ctx.addIssue({ code: "custom", path: ["installments"], message: "A soma das parcelas deve ser igual ao saldo (total − entrada)" });
      return;
    }
    if (v.status === "pago" && !v.paidByUserId)
      ctx.addIssue({ code: "custom", path: ["paidByUserId"], message: "Informe quem pagou" });
    if (v.status === "a_pagar" && !v.dueDate)
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Informe o vencimento da conta" });
    if (v.paidNowCents != null) {
      if (v.status !== "pago")
        ctx.addIssue({ code: "custom", path: ["paidNowCents"], message: "Pagamento parcial só vale para despesa paga" });
      if (v.paidNowCents >= v.amountCents)
        ctx.addIssue({ code: "custom", path: ["paidNowCents"], message: "O valor pago deve ser menor que o total" });
      if (!v.dueDate)
        ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Informe o vencimento do saldo a pagar" });
    }
  });
export type ExpenseCreate = z.infer<typeof expenseCreateSchema>;
export const expenseUpdateSchema = z
  .object({
    date: isoDate.optional(),
    amountCents: cents.optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    description: optText(300),
    status: z.enum(EXPENSE_STATUS).optional(),
    dueDate: optDate,
    paidByUserId: optInt,
    species: z.enum(FINANCE_SPECIES).optional(),
    animalTag: optTag,
    lotId: optInt,
    receipt: photoSchema,
    removeReceipt: z.boolean().optional(),
  });

/** Marcar uma conta a pagar como paga: quem pagou e quando. */
export const payExpenseSchema = z.object({
  paidByUserId: z.coerce.number().int().positive("Informe quem pagou"),
  date: isoDate,
});

export const revenueCreateSchema = z.object({
  clientRef,
  date: isoDate,
  amountCents: cents,
  categoryId: z.coerce.number().int().positive("Escolha a categoria"),
  description: optText(300),
  receivedByUserId: z.coerce.number().int().positive("Informe quem recebeu"),
  species: z.enum(FINANCE_SPECIES).default("ambos"),
  lotId: optInt,
  receipt: photoSchema,
});
export type RevenueCreate = z.infer<typeof revenueCreateSchema>;
export const revenueUpdateSchema = revenueCreateSchema.omit({ clientRef: true }).partial().extend({
  removeReceipt: z.boolean().optional(),
});

export const reimbursementCreateSchema = z.object({
  clientRef,
  date: isoDate,
  amountCents: cents,
  /** Parte que paga o reembolso à outra. */
  fromParty: z.enum(["A", "B"]),
  paidByUserId: z.coerce.number().int().positive("Informe quem pagou"),
  method: z.enum(PAYMENT_METHODS),
  notes: optText(),
});
export type ReimbursementCreate = z.infer<typeof reimbursementCreateSchema>;
export const reimbursementUpdateSchema = reimbursementCreateSchema.omit({ clientRef: true }).partial();

export const lockCreateSchema = z.object({ lockedUntil: isoDate, notes: optText() });
export const lockReopenSchema = z.object({ reason: z.string().trim().min(3, "Informe o motivo").max(300) });

// ---------------------------------------------------------------- Administração

export const shareCreateSchema = z
  .object({
    validFrom: isoDate,
    mode: z.enum(["fracao", "percentual"]),
    num: z.coerce.number().int().min(0).optional(),
    den: z.coerce.number().int().positive().optional(),
    percentA: z.coerce.number().min(0).max(100).optional(),
    notes: optText(),
  })
  .refine((v) => (v.mode === "fracao" ? v.num !== undefined && v.den !== undefined && v.num <= v.den : v.percentA !== undefined), {
    message: "Informe a fração (numerador ≤ denominador) ou o percentual da Parte A",
  });

export const USER_AREA = ["rebanho", "perfumes"] as const;
export const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email("E-mail inválido").transform((s) => s.trim().toLowerCase()),
  password: z.string().min(8, "Senha com no mínimo 8 caracteres").max(200),
  role: z.enum(["admin", "socio"]),
  party: z.enum(["A", "B"]),
  /** Módulo que o usuário acessa: rebanho (gado) ou perfumes. */
  area: z.enum(USER_AREA).default("rebanho"),
});
export const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.email().transform((s) => s.trim().toLowerCase()).optional(),
  password: z.preprocess(emptyToNull, z.string().min(8, "Senha com no mínimo 8 caracteres").max(200).nullable()).optional(),
  role: z.enum(["admin", "socio"]).optional(),
  party: z.enum(["A", "B"]).optional(),
  area: z.enum(USER_AREA).optional(),
  active: z.boolean().optional(),
});
export const passwordChangeSchema = z.object({
  current: z.string().min(1),
  next: z.string().min(8, "Senha com no mínimo 8 caracteres").max(200),
});

export const categorySchema = z.object({
  kind: z.enum(["despesa", "receita"]),
  name: z.string().trim().min(2).max(60),
  active: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});
export const lotSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: optText(200),
  active: z.boolean().optional(),
});

export const loginSchema = z.object({ email: z.string().trim().min(3), password: z.string().min(1) });
export const setupSchema = userCreateSchema.omit({ role: true, party: true }).extend({ party: z.enum(["A", "B"]).default("A") });

// ---------------------------------------------------------------- Perfumes (revenda)

const optCount = z.preprocess(emptyToNull, z.coerce.number().int().min(0).max(1_000_000).nullable()).optional();
const qtyPositive = z.coerce.number().int().positive("Quantidade deve ser maior que zero").max(1_000_000);

export const perfumeCreateSchema = z.object({
  clientRef,
  name: z.string().trim().min(1, "Informe o nome").max(80),
  costCents: optCount, // custo em centavos (default 1300)
  priceCents: optCount, // preço em centavos (default 3000)
  stock: optCount,
  active: z.boolean().optional(),
});
export const perfumeUpdateSchema = perfumeCreateSchema.omit({ clientRef: true }).partial();

/** Registrar venda: baixa estoque e entra no caixa. `unitCents` = preço de venda. */
export const perfumeSaleSchema = z.object({
  clientRef,
  perfumeId: z.coerce.number().int().positive("Escolha o perfume"),
  qty: qtyPositive,
  unitCents: cents,
  date: isoDate,
  soldByUserId: optInt,
  notes: optText(200),
});

/** Registrar compra/reposição: entra estoque e sai do caixa. `unitCents` = custo. */
export const perfumeRestockSchema = z.object({
  clientRef,
  perfumeId: z.coerce.number().int().positive("Escolha o perfume"),
  qty: qtyPositive,
  unitCents: cents,
  date: isoDate,
  notes: optText(200),
});

/** Ajuste manual de estoque (recontagem): define o novo saldo. */
export const perfumeAdjustSchema = z.object({
  perfumeId: z.coerce.number().int().positive(),
  stock: z.coerce.number().int().min(0).max(1_000_000),
  date: isoDate,
  notes: optText(200),
});

// ---------------------------------------------------------------- Recontagem

export const countCreateSchema = z.object({ date: isoDate, lotId: optInt, notes: optText() });
export const countTagSchema = z.object({ tag: tagSchema });
export const countFinishSchema = z.object({ resolution: optText(2000) });
