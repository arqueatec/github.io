/** Esquemas de validação (zod) compartilhados entre formulários e servidor. */
import { z } from "zod";
import { isIsoDate } from "@/domain/dates";

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

export const cents = z.number().int("Valor deve estar em centavos").positive("Valor deve ser maior que zero").max(100_000_000_00);
export const optKg = z.preprocess(emptyToNull, z.coerce.number().min(0).max(500).nullable()).optional();

export const photoSchema = z
  .object({
    mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
    base64: z.string().max(3_000_000, "Foto muito grande (máx. ~2 MB)"),
  })
  .nullable()
  .optional();

export const SEX = ["M", "F"] as const;
export const CATEGORY = ["matriz", "reprodutor", "cordeiro", "borrego", "descarte"] as const;
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
    sex: z.enum(SEX),
    breed: optText(60),
    birthDate: optDate,
    /** Idade estimada em meses quando a data de nascimento é desconhecida. */
    ageMonths: z.preprocess(emptyToNull, z.coerce.number().min(0).max(240).nullable()).optional(),
    birthDateEstimated: z.boolean().optional(),
    motherTag: optTag,
    fatherTag: optTag,
    category: z.enum(CATEGORY),
    lotId: optInt,
    origin: z.enum(ORIGIN).optional(),
    entryDate: optDate,
    notes: optText(1000),
    photo: photoSchema,
  })
  .refine((v) => !(v.category === "matriz" && v.sex === "M"), { message: "Matriz deve ser fêmea", path: ["category"] })
  .refine((v) => !(v.category === "reprodutor" && v.sex === "F"), { message: "Reprodutor deve ser macho", path: ["category"] });
export type AnimalCreate = z.infer<typeof animalCreateSchema>;

export const animalUpdateSchema = z.object({
  tag: tagSchema.optional(),
  sex: z.enum(SEX).optional(),
  breed: optText(60),
  birthDate: optDate,
  birthDateEstimated: z.boolean().optional(),
  motherTag: optTag,
  fatherTag: optTag,
  category: z.enum(CATEGORY).optional(),
  /** Data da mudança de categoria/lote (padrão: hoje). */
  changeDate: optDate,
  lotId: optInt,
  entryDate: optDate,
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

export const expenseCreateSchema = z.object({
  clientRef,
  date: isoDate,
  amountCents: cents,
  categoryId: z.coerce.number().int().positive("Escolha a categoria"),
  description: optText(300),
  paidByUserId: z.coerce.number().int().positive("Informe quem pagou"),
  animalTag: optTag,
  lotId: optInt,
  receipt: photoSchema,
});
export type ExpenseCreate = z.infer<typeof expenseCreateSchema>;
export const expenseUpdateSchema = expenseCreateSchema.omit({ clientRef: true }).partial().extend({
  removeReceipt: z.boolean().optional(),
});

export const revenueCreateSchema = z.object({
  clientRef,
  date: isoDate,
  amountCents: cents,
  categoryId: z.coerce.number().int().positive("Escolha a categoria"),
  description: optText(300),
  receivedByUserId: z.coerce.number().int().positive("Informe quem recebeu"),
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

export const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email("E-mail inválido").transform((s) => s.trim().toLowerCase()),
  password: z.string().min(8, "Senha com no mínimo 8 caracteres").max(200),
  role: z.enum(["admin", "socio"]),
  party: z.enum(["A", "B"]),
});
export const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.email().transform((s) => s.trim().toLowerCase()).optional(),
  password: z.preprocess(emptyToNull, z.string().min(8, "Senha com no mínimo 8 caracteres").max(200).nullable()).optional(),
  role: z.enum(["admin", "socio"]).optional(),
  party: z.enum(["A", "B"]).optional(),
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

// ---------------------------------------------------------------- Recontagem

export const countCreateSchema = z.object({ date: isoDate, lotId: optInt, notes: optText() });
export const countTagSchema = z.object({ tag: tagSchema });
export const countFinishSchema = z.object({ resolution: optText(2000) });
