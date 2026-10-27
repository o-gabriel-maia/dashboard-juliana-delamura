import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  COOKIE_SESSAO,
  iguais,
  tokenDaSenha,
  usuarioEsperado,
} from "./app/lib/auth";

const NOINDEX = "noindex, nofollow, noarchive, nosnippet";

function comNoindex(resposta: NextResponse) {
  resposta.headers.set("X-Robots-Tag", NOINDEX);
  return resposta;
}

export async function proxy(request: NextRequest) {
  const senha = process.env.DASHBOARD_PASSWORD;
  const { pathname } = request.nextUrl;

  // Sem senha configurada o login só é dispensado no ambiente local.
  if (!senha) {
    if (process.env.NODE_ENV !== "production") return comNoindex(NextResponse.next());
    return comNoindex(
      new NextResponse("Dashboard indisponível: senha de acesso não configurada.", {
        status: 503,
      }),
    );
  }

  if (pathname === "/login" || pathname === "/api/login") {
    return comNoindex(NextResponse.next());
  }

  // O cron da Vercel envia o CRON_SECRET (se existir) e não tem cookie.
  const cronSecret = process.env.CRON_SECRET;
  if (
    cronSecret &&
    request.headers.get("authorization") === `Bearer ${cronSecret}`
  ) {
    return comNoindex(NextResponse.next());
  }

  const cookie = request.cookies.get(COOKIE_SESSAO)?.value ?? "";
  const esperado = await tokenDaSenha(senha, usuarioEsperado());
  if (iguais(cookie, esperado)) return comNoindex(NextResponse.next());

  if (pathname.startsWith("/api/")) {
    return comNoindex(
      NextResponse.json({ error: "Não autorizado." }, { status: 401 }),
    );
  }

  const login = new URL("/login", request.url);
  return comNoindex(NextResponse.redirect(login));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"],
};
