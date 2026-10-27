import { NextResponse } from "next/server";
import { CHAVE_AJUSTES, chaveGrupo, lerLinhas, redis } from "../../../lib/grupos";

// Grava quantas pessoas o grupo tem agora. O que já chegou pelo webhook é
// descontado da base, para o total mostrado ser exatamente o número digitado e
// só as entradas e saídas seguintes mexerem nele.
export async function POST(request: Request) {
  const corpo = (await request.json().catch(() => null)) as {
    campanha?: unknown;
    grupo?: unknown;
    quantidade?: unknown;
  } | null;

  const campanha = typeof corpo?.campanha === "string" ? corpo.campanha.trim() : "";
  const grupo = typeof corpo?.grupo === "string" ? corpo.grupo.trim() : "";
  const quantidade = Number(corpo?.quantidade);
  if (!campanha || !grupo || campanha.length > 200 || grupo.length > 200) {
    return NextResponse.json({ error: "Informe a campanha e o nome do grupo." }, { status: 400 });
  }
  if (!Number.isInteger(quantidade) || quantidade < 0 || quantidade > 1_000_000) {
    return NextResponse.json({ error: "Informe um número inteiro de pessoas." }, { status: 400 });
  }

  const db = redis();
  const chave = chaveGrupo(campanha, grupo);
  const { linhas } = await lerLinhas(db);
  const atual = linhas.find((l) => l.chave === chave);
  const base = quantidade - (atual?.webhook ?? 0);

  await db.hset(CHAVE_AJUSTES, {
    [chave]: JSON.stringify({ campanha, grupo, base }),
  });

  return NextResponse.json({
    linha: {
      chave,
      campanha: atual?.campanha ?? campanha,
      grupo: atual?.grupo ?? grupo,
      membros: quantidade,
      webhook: atual?.webhook ?? 0,
      base,
    },
  });
}
