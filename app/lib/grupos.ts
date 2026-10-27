import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

export const CHAVE_GRUPOS = "sf:grupos";
export const CHAVE_AJUSTES = "sf:ajustes";
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

const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// O grupo é identificado por campanha + nome (e não pelo id do WhatsApp) para o
// número manual poder ser digitado antes de chegar o primeiro aviso do grupo.
export const chaveGrupo = (campanha: string, grupo: string) =>
  `${normalizar(campanha)}||${normalizar(grupo)}`;

export type LinhaGrupo = {
  chave: string;
  campanha: string;
  grupo: string;
  // Total mostrado: base manual + entradas e saídas do webhook.
  membros: number;
  webhook: number;
  base: number;
};

type Ajuste = { campanha: string; grupo: string; base: number };

const comoObjeto = <T>(valor: unknown): T =>
  (typeof valor === "string" ? JSON.parse(valor) : valor) as T;

export async function lerLinhas(db: Redis) {
  const [cadastro, ajustes] = await Promise.all([
    db.hgetall<Record<string, unknown>>(CHAVE_GRUPOS),
    db.hgetall<Record<string, unknown>>(CHAVE_AJUSTES),
  ]);
  const ids = Object.keys(cadastro ?? {});

  const pipeline = db.pipeline();
  for (const id of ids) pipeline.scard(chaveMembros(id));
  pipeline.lrange(CHAVE_ULTIMOS, 0, 9);
  const respostas = await pipeline.exec<unknown[]>();

  const porChave = new Map<string, LinhaGrupo>();
  const linhaDe = (campanha: string, grupo: string) => {
    const chave = chaveGrupo(campanha, grupo);
    let linha = porChave.get(chave);
    if (!linha) {
      linha = { chave, campanha, grupo, membros: 0, webhook: 0, base: 0 };
      porChave.set(chave, linha);
    }
    return linha;
  };

  ids.forEach((id, i) => {
    const info = comoObjeto<GrupoInfo>(cadastro![id]);
    linhaDe(info.campanha, info.grupo).webhook += Number(respostas[i] ?? 0);
  });
  for (const valor of Object.values(ajustes ?? {})) {
    const ajuste = comoObjeto<Ajuste>(valor);
    linhaDe(ajuste.campanha, ajuste.grupo).base = ajuste.base;
  }
  for (const linha of porChave.values()) {
    linha.membros = Math.max(0, linha.webhook + linha.base);
  }

  return {
    linhas: [...porChave.values()],
    ultimosEventos: respostas[ids.length] ?? [],
  };
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
