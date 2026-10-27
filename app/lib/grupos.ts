import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

export const CHAVE_GRUPOS = "sf:grupos";
export const CHAVE_ULTIMOS = "sf:ultimos";
export const chaveMembros = (grupoId: string) => `sf:membros:${grupoId}`;

export type GrupoInfo = { campanha: string; grupo: string; campanhaId: string };

export function redis() {
  return Redis.fromEnv();
}

// Guarda só uma versão embaralhada do telefone: serve para contar membros
// únicos sem manter o número real no banco.
export function hashTelefone(numero: string): string {
  return createHash("sha256").update(`sendflow:${numero}`).digest("hex").slice(0, 32);
}

export type EventoGrupo = {
  evento: "entrou" | "saiu";
  grupoId: string;
  info: GrupoInfo;
  telefone: string;
};

type Bruto = Record<string, unknown>;

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// O SendFlow manda { id, event, data }; o n8n costuma embrulhar isso em
// [{ body: { ... } }]. Aceita as duas formas.
export function lerEvento(corpo: unknown): EventoGrupo | null {
  let atual: unknown = Array.isArray(corpo) ? corpo[0] : corpo;
  if (atual && typeof atual === "object" && "body" in atual) {
    atual = (atual as Bruto).body;
  }
  if (!atual || typeof atual !== "object") return null;

  const { event, data } = atual as Bruto;
  const nomeEvento = texto(event);
  const evento = nomeEvento.endsWith(".members.added")
    ? "entrou"
    : nomeEvento.endsWith(".members.removed")
      ? "saiu"
      : null;
  if (!evento || !data || typeof data !== "object") return null;

  const d = data as Bruto;
  const grupoId = texto(d.groupId) || texto(d.groupJid);
  const telefone = texto(d.number).replace(/\D/g, "");
  if (!grupoId || !telefone) return null;

  return {
    evento,
    grupoId,
    telefone,
    info: {
      campanha: texto(d.campaignName),
      grupo: texto(d.groupName),
      campanhaId: texto(d.campaignId),
    },
  };
}
