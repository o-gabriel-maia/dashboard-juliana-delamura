import { createSign } from "node:crypto";

// Leitura de planilha com a conta de serviço do Google (variável de ambiente
// GOOGLE_SERVICE_ACCOUNT_JSON com o conteúdo do arquivo da chave). Assim a
// planilha pode ficar restrita, sem link público. Sem a variável, quem chama usa
// o link público como antes.

type ServiceAccount = { client_email: string; private_key: string };

let cachedAccount: ServiceAccount | null | undefined;
let cachedToken: { value: string; expiresAt: number } | null = null;

function serviceAccount(): ServiceAccount | null {
  if (cachedAccount !== undefined) return cachedAccount;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return (cachedAccount = null);
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    cachedAccount = parsed.client_email && parsed.private_key ? parsed : null;
  } catch {
    cachedAccount = null;
  }
  return cachedAccount;
}

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

async function accessToken(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${claim}`)
    .sign(account.private_key.replace(/\\n/g, "\n"));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${b64url(signature)}`,
    }),
    cache: "no-store",
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) throw new Error("Não foi possível autenticar a conta de serviço do Google.");
  cachedToken = { value: json.access_token, expiresAt: now + (json.expires_in ?? 3600) };
  return cachedToken.value;
}

// "E:J" -> 6 colunas; "A:A" -> 1.
function width(range: string) {
  const col = (letters: string) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const [from, to] = range.split(":");
  return col(to.replace(/\d/g, "")) - col(from.replace(/\d/g, "")) + 1;
}

// Linhas da faixa pedida (com o cabeçalho), como texto, ou null se a conta de
// serviço não estiver configurada. A API corta as células vazias do fim da linha;
// aqui elas voltam como "", igual ao CSV público.
export async function serviceAccountRows(
  sheetId: string,
  tab: string,
  range: string,
): Promise<string[][] | null> {
  const account = serviceAccount();
  if (!account) return null;
  const token = await accessToken(account);
  const a1 = encodeURIComponent(`'${tab}'!${range}`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${a1}` +
      `?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) throw new Error("Não foi possível ler a planilha com a conta de serviço. Confira se ela foi compartilhada com o e-mail dela.");
  const json = (await res.json()) as { values?: string[][] };
  const w = width(range);
  return (json.values ?? []).map((row) => Array.from({ length: w }, (_, i) => String(row[i] ?? "")));
}
