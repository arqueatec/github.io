/**
 * Esquema do banco (PostgreSQL) — fonte da verdade para as migrações do drizzle-kit.
 *
 * Convenções:
 *  - Valores monetários em centavos (integer).
 *  - Pesos em gramas (integer) para evitar erros de ponto flutuante.
 *  - Datas de negócio como `date` (string "YYYY-MM-DD"); carimbos de tempo como `timestamptz`.
 *  - `client_ref` (uuid, único) permite reenvio idempotente de lançamentos feitos offline.
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  date,
  timestamp,
  uuid,
  jsonb,
  real,
  pgEnum,
  uniqueIndex,
  index,
  customType,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const roleEnum = pgEnum("user_role", ["admin", "socio"]);
export const partyEnum = pgEnum("party", ["A", "B"]);
export const sexEnum = pgEnum("sex", ["M", "F"]);
export const animalCategoryEnum = pgEnum("animal_category", [
  "matriz",
  "reprodutor",
  "cordeiro",
  "borrego",
  "descarte",
]);
export const animalStatusEnum = pgEnum("animal_status", [
  "ativo",
  "vendido",
  "morto",
  "abatido",
  "consumo_proprio",
]);
export const animalOriginEnum = pgEnum("animal_origin", ["inventario", "nascimento", "compra", "importacao"]);
export const exitTypeEnum = pgEnum("exit_type", ["venda", "morte", "abate", "consumo_proprio"]);
export const healthTypeEnum = pgEnum("health_type", ["vacina", "vermifugacao", "tratamento", "outro"]);
export const pregnancyResultEnum = pgEnum("pregnancy_result", ["prenhe", "vazia", "duvidosa"]);
export const categoryKindEnum = pgEnum("category_kind", ["despesa", "receita"]);

// ---------------------------------------------------------------- Usuários / sessão

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("socio"),
  party: partyEnum("party").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256 do token
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    success: boolean("success").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_email_at_idx").on(t.email, t.at)],
);

// ---------------------------------------------------------------- Configuração

/** Participação da Parte A como fração (num/den); Parte B = 1 − A. Histórico por vigência. */
export const shareConfigs = pgTable(
  "share_configs",
  {
    id: serial("id").primaryKey(),
    validFrom: date("valid_from").notNull().unique(),
    shareANum: integer("share_a_num").notNull(),
    shareDen: integer("share_den").notNull(),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("share_valid", sql`${t.shareDen} > 0 AND ${t.shareANum} >= 0 AND ${t.shareANum} <= ${t.shareDen}`)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    kind: categoryKindEnum("kind").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("categories_kind_name_uq").on(t.kind, t.name)],
);

export const lots = pgTable("lots", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
});

export const attachments = pgTable("attachments", {
  id: serial("id").primaryKey(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  data: bytea("data").notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------- Rebanho

export const animals = pgTable(
  "animals",
  {
    id: serial("id").primaryKey(),
    clientRef: uuid("client_ref").unique(),
    tag: text("tag").notNull().unique(),
    sex: sexEnum("sex").notNull(),
    breed: text("breed"),
    birthDate: date("birth_date"),
    birthDateEstimated: boolean("birth_date_estimated").notNull().default(false),
    motherId: integer("mother_id").references((): AnyPgColumn => animals.id, { onDelete: "set null" }),
    fatherId: integer("father_id").references((): AnyPgColumn => animals.id, { onDelete: "set null" }),
    birthId: integer("birth_id"),
    category: animalCategoryEnum("category").notNull(),
    status: animalStatusEnum("status").notNull().default("ativo"),
    lotId: integer("lot_id").references(() => lots.id),
    origin: animalOriginEnum("origin").notNull().default("inventario"),
    /** Data em que o animal passou a fazer parte do efetivo controlado pelo sistema. */
    entryDate: date("entry_date").notNull(),
    exitDate: date("exit_date"),
    photoId: integer("photo_id").references(() => attachments.id),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("animals_mother_idx").on(t.motherId),
    index("animals_status_idx").on(t.status),
    index("animals_lot_idx").on(t.lotId),
  ],
);

/** Histórico de categoria, usado para evolução do efetivo por categoria no tempo. */
export const animalCategoryChanges = pgTable(
  "animal_category_changes",
  {
    id: serial("id").primaryKey(),
    animalId: integer("animal_id")
      .notNull()
      .references(() => animals.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    fromCategory: animalCategoryEnum("from_category"),
    toCategory: animalCategoryEnum("to_category").notNull(),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("acc_animal_idx").on(t.animalId, t.date)],
);

export const lotChanges = pgTable("lot_changes", {
  id: serial("id").primaryKey(),
  animalId: integer("animal_id")
    .notNull()
    .references(() => animals.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  fromLotId: integer("from_lot_id").references(() => lots.id),
  toLotId: integer("to_lot_id").references(() => lots.id),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------- Reprodução

export const breedings = pgTable(
  "breedings",
  {
    id: serial("id").primaryKey(),
    clientRef: uuid("client_ref").unique(),
    eweId: integer("ewe_id")
      .notNull()
      .references(() => animals.id, { onDelete: "cascade" }),
    ramId: integer("ram_id").references(() => animals.id),
    date: date("date").notNull(),
    endDate: date("end_date"),
    method: text("method").notNull().default("monta_natural"),
    seasonName: text("season_name"),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("breedings_ewe_idx").on(t.eweId, t.date)],
);

export const pregnancyChecks = pgTable("pregnancy_checks", {
  id: serial("id").primaryKey(),
  clientRef: uuid("client_ref").unique(),
  eweId: integer("ewe_id")
    .notNull()
    .references(() => animals.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  result: pregnancyResultEnum("result").notNull(),
  method: text("method"),
  fetusCount: integer("fetus_count"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const births = pgTable(
  "births",
  {
    id: serial("id").primaryKey(),
    clientRef: uuid("client_ref").unique(),
    eweId: integer("ewe_id")
      .notNull()
      .references(() => animals.id, { onDelete: "cascade" }),
    ramId: integer("ram_id").references(() => animals.id),
    date: date("date").notNull(),
    bornAlive: integer("born_alive").notNull().default(0),
    bornDead: integer("born_dead").notNull().default(0),
    birthType: text("birth_type").notNull().default("normal"),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("births_ewe_idx").on(t.eweId, t.date),
    check("births_counts", sql`${t.bornAlive} >= 0 AND ${t.bornDead} >= 0 AND ${t.bornAlive} + ${t.bornDead} > 0`),
  ],
);

export const weanings = pgTable("weanings", {
  id: serial("id").primaryKey(),
  clientRef: uuid("client_ref").unique(),
  animalId: integer("animal_id")
    .notNull()
    .unique()
    .references(() => animals.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  weightG: integer("weight_g"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------- Sanidade e manejo

export const healthEvents = pgTable(
  "health_events",
  {
    id: serial("id").primaryKey(),
    clientRef: uuid("client_ref").unique(),
    batchId: uuid("batch_id"),
    animalId: integer("animal_id")
      .notNull()
      .references(() => animals.id, { onDelete: "cascade" }),
    type: healthTypeEnum("type").notNull(),
    date: date("date").notNull(),
    product: text("product"),
    dose: text("dose"),
    famacha: integer("famacha"),
    withdrawalDays: integer("withdrawal_days"),
    withdrawalUntil: date("withdrawal_until"),
    nextDoseDate: date("next_dose_date"),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("health_animal_idx").on(t.animalId, t.date), index("health_next_idx").on(t.nextDoseDate)],
);

export const weighings = pgTable(
  "weighings",
  {
    id: serial("id").primaryKey(),
    clientRef: uuid("client_ref").unique(),
    animalId: integer("animal_id")
      .notNull()
      .references(() => animals.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    weightG: integer("weight_g"),
    bodyScore: real("body_score"),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("weighings_animal_idx").on(t.animalId, t.date)],
);

// ---------------------------------------------------------------- Baixas

export const animalExits = pgTable("animal_exits", {
  id: serial("id").primaryKey(),
  clientRef: uuid("client_ref").unique(),
  animalId: integer("animal_id")
    .notNull()
    .unique()
    .references(() => animals.id, { onDelete: "cascade" }),
  type: exitTypeEnum("type").notNull(),
  date: date("date").notNull(),
  cause: text("cause"),
  buyer: text("buyer"),
  weightG: integer("weight_g"),
  priceMode: text("price_mode"), // 'kg' | 'cabeca'
  unitPriceCents: integer("unit_price_cents"),
  totalCents: integer("total_cents"),
  revenueId: integer("revenue_id"),
  previousCategory: animalCategoryEnum("previous_category"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------- Finanças

export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    clientRef: uuid("client_ref").unique(),
    date: date("date").notNull(),
    amountCents: integer("amount_cents").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    description: text("description"),
    paidByUserId: integer("paid_by_user_id")
      .notNull()
      .references(() => users.id),
    /** Parte derivada do usuário pagante no momento do lançamento (snapshot). */
    party: partyEnum("party").notNull(),
    animalId: integer("animal_id").references(() => animals.id, { onDelete: "set null" }),
    lotId: integer("lot_id").references(() => lots.id),
    receiptId: integer("receipt_id").references(() => attachments.id),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("expenses_date_idx").on(t.date), check("expenses_amount_pos", sql`${t.amountCents} > 0`)],
);

export const revenues = pgTable(
  "revenues",
  {
    id: serial("id").primaryKey(),
    clientRef: uuid("client_ref").unique(),
    date: date("date").notNull(),
    amountCents: integer("amount_cents").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    description: text("description"),
    receivedByUserId: integer("received_by_user_id")
      .notNull()
      .references(() => users.id),
    party: partyEnum("party").notNull(),
    lotId: integer("lot_id").references(() => lots.id),
    receiptId: integer("receipt_id").references(() => attachments.id),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("revenues_date_idx").on(t.date), check("revenues_amount_pos", sql`${t.amountCents} > 0`)],
);

/** Reembolso (quitação) entre as partes: `fromParty` paga `amount` para a outra parte. */
export const reimbursements = pgTable(
  "reimbursements",
  {
    id: serial("id").primaryKey(),
    clientRef: uuid("client_ref").unique(),
    date: date("date").notNull(),
    amountCents: integer("amount_cents").notNull(),
    fromParty: partyEnum("from_party").notNull(),
    paidByUserId: integer("paid_by_user_id")
      .notNull()
      .references(() => users.id),
    method: text("method").notNull(),
    notes: text("notes"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [check("reimb_amount_pos", sql`${t.amountCents} > 0`)],
);

/** Fechamento (acerto) de período: lançamentos com data <= lockedUntil ficam travados. */
export const periodLocks = pgTable("period_locks", {
  id: serial("id").primaryKey(),
  lockedUntil: date("locked_until").notNull(),
  balanceCents: integer("balance_cents").notNull(),
  notes: text("notes"),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  reopenedBy: integer("reopened_by").references(() => users.id),
  reopenReason: text("reopen_reason"),
});

// ---------------------------------------------------------------- Recontagem

export const inventoryCounts = pgTable("inventory_counts", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  lotId: integer("lot_id").references(() => lots.id),
  status: text("status").notNull().default("aberta"), // aberta | concluida
  notes: text("notes"),
  /** Divergências calculadas na conclusão: { expected, seen, missing[], unexpected[], resolution } */
  result: jsonb("result"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const inventoryCountItems = pgTable(
  "inventory_count_items",
  {
    id: serial("id").primaryKey(),
    countId: integer("count_id")
      .notNull()
      .references(() => inventoryCounts.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("count_items_uq").on(t.countId, t.tag)],
);

// ---------------------------------------------------------------- Auditoria

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    userId: integer("user_id").references(() => users.id),
    entity: text("entity").notNull(),
    entityId: integer("entity_id"),
    action: text("action").notNull(), // create | update | delete | reopen | lock
    before: jsonb("before"),
    after: jsonb("after"),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId)],
);
