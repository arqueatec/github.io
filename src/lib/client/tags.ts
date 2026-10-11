"use client";
import { useEffect, useState } from "react";

export interface TagInfo {
  id: number;
  tag: string;
  sex: "M" | "F";
  category: string;
  status: string;
}

const KEY = "ovinos-tags-v1";
let memory: TagInfo[] | null = null;
const listeners = new Set<(t: TagInfo[]) => void>();

function readCache(): TagInfo[] {
  if (memory) return memory;
  try {
    memory = JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    memory = [];
  }
  return memory!;
}

export async function refreshTags(): Promise<TagInfo[]> {
  try {
    const res = await fetch("/api/animals/tags", { credentials: "same-origin" });
    if (!res.ok) return readCache();
    const data = (await res.json()) as TagInfo[];
    memory = data;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {}
    listeners.forEach((l) => l(data));
    return data;
  } catch {
    return readCache();
  }
}

/** Adiciona localmente (ex.: cadastro offline) para o bloqueio de duplicados funcionar sem rede. */
export function addLocalTag(t: Omit<TagInfo, "id"> & { id?: number }) {
  const list = [...readCache(), { id: t.id ?? -Date.now(), ...t }];
  memory = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
  listeners.forEach((l) => l(list));
}

/** Lista de brincos conhecida (cache local + atualização em segundo plano). */
export function useTags() {
  const [tags, setTags] = useState<TagInfo[]>([]);
  useEffect(() => {
    setTags(readCache());
    listeners.add(setTags);
    void refreshTags();
    return () => {
      listeners.delete(setTags);
    };
  }, []);
  return tags;
}

export function findTag(tags: TagInfo[], tag: string) {
  const t = tag.trim().toLowerCase();
  return tags.find((x) => x.tag.toLowerCase() === t);
}
