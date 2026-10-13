import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type DateRange = { since: string; until: string };

// Planilha de resultado da pesquisa do LI 35, aba "Leads C/UTM": uma linha por
// inscrição, com a data, a resposta "Você já tem Silhouette?" (Sim = TS, Não =
// NTS) e a UTM de origem. A planilha está com compartilhamento por link, então a
// leitura não precisa de credencial. Só as colunas E a H são lidas (sem e-mail
// nem telefone).
const SHEET_ID = "1zcEFVG7Lr9bKlh_pkLiSYYjByI9iyabSNLciQrvg8iM";
const TAB = "Leads C/UTM";
// Origem de tráfego pago: o nome da UTM de origem tem "paid". Meta Ads usa
// fb-paid-hot e fb-paid-cold; o Google Ads (YouTube) usa yt-paid-hot.
const PAID_SOURCE = /paid/i;
// Dentro do tráfego pago, o que é do Google Ads (YouTube); o resto é do Meta Ads.
const GOOGLE_SOURCE = /(^|[-_])(yt|youtube|google|gads)([-_]|$)/i;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 370;

type Counts = {
  tsPaid: number;
  ntsPaid: number;
  tsOther: number;
  ntsOther: number;
  // Parte do tráfego pago que veio do Google Ads (o resto é do Meta Ads).
  tsGoogle: number;
  ntsGoogle: number;
};
const EMPTY: Counts = { tsPaid: 0, ntsPaid: 0, tsOther: 0, ntsOther: 0, tsGoogle: 0, ntsGoogle: 0 };

function todayInBrazil() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function resolveRange(since: string | null, until: string | null): DateRange {
  const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (isDate(since) && isDate(until) && since <= until) {
    const minSince = addDays(until, -(MAX_RANGE_DAYS - 1));
    return { since: since < minSince ? minSince : since, until };
  }
  const today = todayInBrazil();
  return { since: addDays(today, -(DEFAULT_RANGE_DAYS - 1)), until: today };
}

function previousRange(range: DateRange): DateRange {
  const days =
    Math.round(
      (Date.parse(`${range.until}T00:00:00Z`) - Date.parse(`${range.since}T00:00:00Z`)) / 86400000
    ) + 1;
  const until = addDays(range.since, -1);
  return { since: addDays(until, -(days - 1)), until };
}

// CSV simples, com aspas e vírgulas dentro das aspas.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// "13/10/2026" -> "2026-10-13"
function isoDate(br: string) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(br.trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

function inRange(date: string, range: DateRange) {
  return date >= range.since && date <= range.until;
}

function sumCounts(rows: Counts[]): Counts {
  return rows.reduce(
    (a, b) => ({
      tsPaid: a.tsPaid + b.tsPaid,
      ntsPaid: a.ntsPaid + b.ntsPaid,
      tsOther: a.tsOther + b.tsOther,
      ntsOther: a.ntsOther + b.ntsOther,
      tsGoogle: a.tsGoogle + b.tsGoogle,
      ntsGoogle: a.ntsGoogle + b.ntsGoogle,
    }),
    { ...EMPTY }
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = resolveRange(searchParams.get("since"), searchParams.get("until"));
    const previous = previousRange(range);

    const url =
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv` +
      `&sheet=${encodeURIComponent(TAB)}&range=E:H`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Não foi possível ler a planilha de leads.");
    const table = parseCsv(await res.text());
    if (table.length === 0 || !/Data/i.test(table[0][0] ?? "")) {
      throw new Error("A planilha de leads veio em formato inesperado. Confira se o link continua compartilhado.");
    }

    const byDate = new Map<string, Counts>();
    let withoutAnswer = 0;
    for (const [dateBr, answer, source] of table.slice(1)) {
      const date = isoDate(dateBr ?? "");
      if (!date) continue;
      const a = (answer ?? "").trim().toLowerCase();
      const isTs = a === "sim";
      const isNts = a === "não" || a === "nao";
      if (!isTs && !isNts) {
        if (inRange(date, range)) withoutAnswer++;
        continue;
      }
      const paid = PAID_SOURCE.test(source ?? "");
      const day = byDate.get(date) ?? { ...EMPTY };
      if (isTs) day[paid ? "tsPaid" : "tsOther"]++;
      else day[paid ? "ntsPaid" : "ntsOther"]++;
      if (paid && GOOGLE_SOURCE.test(source ?? "")) {
        if (isTs) day.tsGoogle++;
        else day.ntsGoogle++;
      }
      byDate.set(date, day);
    }

    const daily = [];
    for (let date = range.since; date <= range.until; date = addDays(date, 1)) {
      daily.push({ date, ...(byDate.get(date) ?? EMPTY) });
    }
    const totalsOf = (r: DateRange) =>
      sumCounts([...byDate].filter(([d]) => inRange(d, r)).map(([, c]) => c));

    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      range,
      previousRange: previous,
      totals: totalsOf(range),
      previousTotals: totalsOf(previous),
      daily,
      withoutAnswer,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao ler a planilha de leads.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
