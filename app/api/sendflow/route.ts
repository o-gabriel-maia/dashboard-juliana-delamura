import { NextResponse } from "next/server";
import { iguais } from "../../lib/auth";
import {
  CHAVE_GRUPOS,
  CHAVE_ULTIMOS,
  chaveMembros,
  hashTelefone,
  lerEvento,
  redis,
} from "../../lib/grupos";

// Recebe os avisos de entrada e saída de grupo do SendFlow (ou o repasse do n8n).
// Fica fora do login do dashboard e se protege com uma chave na própria URL.
export async function POST(request: Request) {
  const chave = process.env.SENDFLOW_WEBHOOK_KEY;
  const enviada = new URL(request.url).searchParams.get("chave") ?? "";
  if (!chave || !iguais(enviada, chave)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const corpo = await request.json().catch(() => null);
  const evento = lerEvento(corpo);
  if (!evento) return NextResponse.json({ ignorado: true });

  const db = redis();
  const membro = hashTelefone(evento.telefone);
  const agora = new Date().toISOString();

  const pipeline = db.pipeline();
  pipeline.hset(CHAVE_GRUPOS, { [evento.grupoId]: JSON.stringify(evento.info) });
  if (evento.evento === "entrou") pipeline.sadd(chaveMembros(evento.grupoId), membro);
  else pipeline.srem(chaveMembros(evento.grupoId), membro);
  pipeline.lpush(
    CHAVE_ULTIMOS,
    JSON.stringify({ quando: agora, evento: evento.evento, ...evento.info }),
  );
  pipeline.ltrim(CHAVE_ULTIMOS, 0, 49);
  await pipeline.exec();

  return NextResponse.json({ ok: true });
}
