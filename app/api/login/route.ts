import { NextResponse } from "next/server";
import {
  COOKIE_SESSAO,
  DURACAO_SESSAO_SEGUNDOS,
  iguais,
  tokenDaSenha,
  usuarioEsperado,
} from "../../lib/auth";

export async function POST(request: Request) {
  const senhaCorreta = process.env.DASHBOARD_PASSWORD;
  const dados = await request.formData();
  const usuario = String(dados.get("usuario") ?? "");
  const senha = String(dados.get("senha") ?? "");
  const manterConectado = dados.get("manter") === "on";

  const destino = (caminho: string) => new URL(caminho, request.url);

  if (!senhaCorreta) return NextResponse.redirect(destino("/login?erro=1"), 303);

  // Usuário e senha entram no mesmo token, então uma comparação só cobre os dois.
  const [enviado, esperado] = await Promise.all([
    tokenDaSenha(senha, usuario),
    tokenDaSenha(senhaCorreta, usuarioEsperado()),
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
    // Sem a caixa marcada o cookie é de sessão e some quando o navegador fecha.
    ...(manterConectado ? { maxAge: DURACAO_SESSAO_SEGUNDOS } : {}),
  });
  return resposta;
}
