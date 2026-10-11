"use client";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { apiSend, ApiError } from "@/lib/client/api";
import { compressImage } from "@/lib/client/image";
import { findTag, useTags, type TagInfo } from "@/lib/client/tags";
import { categoryLabel, STATUS_LABEL } from "@/lib/labels";
import { parseMoneyToCents, centsToInput } from "@/domain/money";
import { cx } from "./ui";

// ---------------------------------------------------------------- Toast

type ToastMsg = { id: number; text: string; tone: "ok" | "err" | "info" };
const TOAST_EVENT = "ovinos-toast";

export function toast(text: string, tone: ToastMsg["tone"] = "ok") {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { text, tone } }));
}

export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as Omit<ToastMsg, "id">;
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { ...d, id }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500);
    };
    window.addEventListener(TOAST_EVENT, on);
    return () => window.removeEventListener(TOAST_EVENT, on);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={cx("toast pointer-events-auto", `toast-${t.tone}`)} role="status">
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Campos

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cx("field", className)}>
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, name }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; name?: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={cx(value === o.value && "active")}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Campo de dinheiro em texto (aceita 1.234,56). Valor externo em centavos. */
export function MoneyInput({ cents, onChange, required, autoFocus, placeholder = "0,00" }: { cents: number | null; onChange: (c: number | null) => void; required?: boolean; autoFocus?: boolean; placeholder?: string }) {
  const [text, setText] = useState(cents ? centsToInput(cents) : "");
  useEffect(() => {
    if (cents === null) setText("");
  }, [cents]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">R$</span>
      <input
        className="input pl-10 tabular-nums"
        inputMode="decimal"
        value={text}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseMoneyToCents(e.target.value));
        }}
      />
    </div>
  );
}

function tagSuffix(t: TagInfo) {
  return `${categoryLabel(t.category, t.sex)}${t.status !== "ativo" ? ` · ${STATUS_LABEL[t.status] ?? t.status}` : ""}`;
}

/** Entrada de brinco com sugestões dos brincos conhecidos (funciona offline com o cache). */
export function TagInput({
  value,
  onChange,
  filter,
  placeholder = "Nº do brinco",
  autoFocus,
  required,
  mustExist = true,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  filter?: (t: TagInfo) => boolean;
  placeholder?: string;
  autoFocus?: boolean;
  required?: boolean;
  mustExist?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const tags = useTags();
  const id = useId();
  const list = filter ? tags.filter(filter) : tags;
  const found = value ? findTag(tags, value) : undefined;
  const warn = mustExist && value && tags.length > 0 && !found;
  return (
    <div>
      <input
        ref={inputRef}
        className={cx("input", warn && "input-warn")}
        list={id}
        value={value}
        autoFocus={autoFocus}
        required={required}
        autoCapitalize="characters"
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={id}>
        {list.slice(0, 400).map((t) => (
          <option key={t.id} value={t.tag}>
            {tagSuffix(t)}
          </option>
        ))}
      </datalist>
      {found && <span className="field-hint">{tagSuffix(found)}</span>}
      {warn && <span className="field-hint text-[var(--warn)]">Brinco não encontrado na lista local</span>}
    </div>
  );
}

/** Seleção de vários brincos (chips). Enter/vírgula adiciona. */
export function TagListInput({
  values,
  onChange,
  filter,
  extra,
  placeholder = "Digite o brinco e Enter",
}: {
  values: string[];
  onChange: (v: string[]) => void;
  filter?: (t: TagInfo) => boolean;
  extra?: (tag: string) => ReactNode;
  placeholder?: string;
}) {
  const tags = useTags();
  const [text, setText] = useState("");
  const id = useId();
  const options = (filter ? tags.filter(filter) : tags).filter((t) => !values.some((v) => v.toLowerCase() === t.tag.toLowerCase()));
  const add = (raw: string) => {
    const parts = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    const next = [...values];
    for (const p of parts) {
      const canonical = findTag(tags, p)?.tag ?? p;
      if (!next.some((v) => v.toLowerCase() === canonical.toLowerCase())) next.push(canonical);
    }
    onChange(next);
    setText("");
  };
  return (
    <div>
      <div className="flex gap-2">
        <input
          className="input"
          list={id}
          value={text}
          placeholder={placeholder}
          autoCapitalize="characters"
          autoComplete="off"
          onChange={(e) => {
            const v = e.target.value;
            // seleção no datalist: adiciona direto
            if (options.some((o) => o.tag === v)) add(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && text.trim()) {
              e.preventDefault();
              add(text);
            }
          }}
        />
        <button type="button" className="btn btn-secondary" onClick={() => text.trim() && add(text)}>
          +
        </button>
      </div>
      <datalist id={id}>
        {options.slice(0, 400).map((t) => (
          <option key={t.id} value={t.tag}>
            {tagSuffix(t)}
          </option>
        ))}
      </datalist>
      {values.length > 0 && (
        <ul className="mt-2 space-y-1">
          {values.map((v) => {
            const f = findTag(tags, v);
            return (
              <li key={v} className="chip-row">
                <span className="font-semibold">{v}</span>
                <span className={cx("text-xs", f ? "text-[var(--muted)]" : "text-[var(--warn)]")}>{f ? tagSuffix(f) : "não encontrado"}</span>
                <span className="ml-auto flex items-center gap-2">
                  {extra?.(v)}
                  <button type="button" className="text-[var(--bad)]" aria-label={`Remover ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
                    ✕
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {values.length > 0 && <p className="field-hint">{values.length} animal(is) selecionado(s)</p>}
    </div>
  );
}

export function PhotoInput({ value, onChange, label = "Foto (opcional)" }: { value: { mime: string; base64: string } | null; onChange: (v: { mime: "image/jpeg"; base64: string } | null) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-secondary" onClick={() => ref.current?.click()} disabled={busy}>
          📷 {value ? "Trocar foto" : "Tirar/escolher foto"}
        </button>
        {value && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:${value.mime};base64,${value.base64}`} alt="Prévia" className="h-12 w-12 rounded object-cover" />
            <button type="button" className="text-sm text-[var(--bad)]" onClick={() => onChange(null)}>
              remover
            </button>
          </>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          try {
            onChange(await compressImage(f));
          } catch {
            toast("Não foi possível ler a foto", "err");
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Envio

/**
 * Hook de envio padrão: mostra erros, avisa quando o lançamento ficou na fila offline
 * e atualiza a página (router.refresh) após sucesso.
 */
export function useSubmit<T = unknown>() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(
    method: "POST" | "PATCH" | "DELETE",
    url: string,
    body: Record<string, unknown> | undefined,
    opts: { offline?: string; success?: string; redirect?: string; onSuccess?: (data: T | null, queued: boolean) => void } = {},
  ) {
    setBusy(true);
    setError(null);
    try {
      const r = await apiSend<T>(method, url, body, { offline: opts.offline });
      if (r.queued) toast(`Sem conexão: "${opts.offline}" guardado no celular e será enviado quando houver sinal.`, "info");
      else if (opts.success) toast(opts.success);
      opts.onSuccess?.(r.data, r.queued);
      if (opts.redirect && !r.queued) router.push(opts.redirect);
      else router.refresh();
      return r;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Erro inesperado";
      setError(msg);
      toast(msg, "err");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { submit, busy, error, setError };
}

export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="rounded-lg border border-[var(--bad)] bg-[var(--bad-bg)] p-3 text-sm text-[var(--bad)]" role="alert">
      {error}
    </div>
  );
}

export function SubmitBar({ busy, label = "Salvar", children }: { busy: boolean; label?: string; children?: ReactNode }) {
  return (
    <div className="submit-bar">
      {children}
      <button type="submit" className="btn btn-primary btn-lg flex-1" disabled={busy}>
        {busy ? "Salvando…" : label}
      </button>
    </div>
  );
}

export function DeleteButton({ url, label = "Excluir", confirmText = "Confirma a exclusão?", redirect, small }: { url: string; label?: string; confirmText?: string; redirect?: string; small?: boolean }) {
  const { submit, busy } = useSubmit();
  return (
    <button
      type="button"
      className={cx("btn btn-danger", small && "btn-sm")}
      disabled={busy}
      onClick={() => {
        if (confirm(confirmText)) void submit("DELETE", url, undefined, { success: "Excluído", redirect });
      }}
    >
      {busy ? "…" : label}
    </button>
  );
}

export function todayLocal() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
