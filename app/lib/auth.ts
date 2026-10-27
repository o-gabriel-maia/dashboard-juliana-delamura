export const COOKIE_SESSAO = "sessao_dashboard";
export const DURACAO_SESSAO_SEGUNDOS = 60 * 60 * 24 * 30;

// O cookie guarda um HMAC da senha, nunca a senha: trocar a senha na Vercel
// invalida todas as sessões abertas.
export function usuarioEsperado(): string {
  return (process.env.DASHBOARD_USER ?? "Equipe Silhouette").trim().toLowerCase();
}

export function normalizarUsuario(usuario: string): string {
  return usuario.trim().toLowerCase();
}

export async function tokenDaSenha(senha: string, usuario: string): Promise<string> {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    "raw",
    enc.encode(senha),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign(
    "HMAC",
    chave,
    enc.encode(`dashboard-juliana-delamura:${normalizarUsuario(usuario)}`),
  );
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}
