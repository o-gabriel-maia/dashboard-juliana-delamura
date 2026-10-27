import { NextResponse } from "next/server";
import {
  CHAVE_GRUPOS,
  CHAVE_ULTIMOS,
  chaveMembros,
  redis,
  type GrupoInfo,
} from "../../lib/grupos";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = redis();
  const cadastro = (await db.hgetall<Record<string, GrupoInfo | string>>(CHAVE_GRUPOS)) ?? {};
  const ids = Object.keys(cadastro);

  const pipeline = db.pipeline();
  for (const id of ids) pipeline.scard(chaveMembros(id));
  pipeline.lrange(CHAVE_ULTIMOS, 0, 9);
  const respostas = await pipeline.exec<unknown[]>();

  const grupos = ids.map((id, i) => {
    const bruto = cadastro[id];
    const info = (typeof bruto === "string" ? JSON.parse(bruto) : bruto) as GrupoInfo;
    return { id, ...info, membros: Number(respostas[i] ?? 0) };
  });

  const porCampanha = new Map<string, { campanha: string; grupos: number; membros: number }>();
  for (const g of grupos) {
    const atual = porCampanha.get(g.campanha) ?? { campanha: g.campanha, grupos: 0, membros: 0 };
    atual.grupos += 1;
    atual.membros += g.membros;
    porCampanha.set(g.campanha, atual);
  }

  return NextResponse.json({
    campanhas: [...porCampanha.values()].sort((a, b) => b.membros - a.membros),
    grupos,
    ultimosEventos: respostas[ids.length] ?? [],
  });
}
