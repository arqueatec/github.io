-- Dados de referência necessários em qualquer instalação (não são dados de demonstração).
INSERT INTO "share_configs" ("valid_from", "share_a_num", "share_den", "notes")
VALUES ('2000-01-01', 1, 3, 'Configuração inicial: Parte A 1/3, Parte B 2/3')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "categories" ("kind", "name", "sort_order") VALUES
  ('despesa', 'Veterinário', 10),
  ('despesa', 'Medicamentos', 20),
  ('despesa', 'Ração/sal mineral', 30),
  ('despesa', 'Cerca e infraestrutura', 40),
  ('despesa', 'Mão de obra', 50),
  ('despesa', 'Transporte', 60),
  ('despesa', 'Compra de animais', 70),
  ('despesa', 'Outros', 99),
  ('receita', 'Venda de animais', 10),
  ('receita', 'Lã', 20),
  ('receita', 'Esterco', 30),
  ('receita', 'Outros', 99)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "settings" ("key", "value") VALUES ('inventory_target', '50') ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Garante no máximo uma recontagem aberta por vez
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_counts_one_open" ON "inventory_counts" ("status") WHERE "status" = 'aberta';
--> statement-breakpoint
-- Busca por brinco sem diferenciar maiúsculas/minúsculas
CREATE UNIQUE INDEX IF NOT EXISTS "animals_tag_lower_uq" ON "animals" (lower("tag"));
