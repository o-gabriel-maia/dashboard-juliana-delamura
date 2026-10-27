import { NextResponse } from "next/server";
import {
  COOKIE_SESSAO,
  DURACAO_SESSAO_SEGUNDOS,
  iguais,
  tokenDaSenha,
} from "../../lib/auth";

export async function POST(request: Request) {
  const senhaCorreta = process.env.DASHBOARD_PASSWORD;
  const dados = await request.formData();
  const senha = String(dados.get("senha") ?? "");

  const destino = (caminho: string) => new URL(caminho, request.url);

  if (!senhaCorreta) return NextResponse.redirect(destino("/login?erro=1"), 303);

  const [enviado, esperado] = await Promise.all([
    tokenDaSenha(senha),
    tokenDaSenha(senhaCorreta),
  ]);
  if (!iguais(enviado, esperado)) {
    return NextResponse.redirect(destino("/login?erro=1"), 303);
  }

  const resposta = NextResponse.redirect(destino("/"), 303);
  resposta.cookies.set(COOKIE_SESSAO, esperado, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_SESSAO_SEGUNDOS,
  });
  return resposta;
}
