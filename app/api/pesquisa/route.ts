import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type DateRange = { since: string; until: string };

// Aba "Respostas pesquisa" da planilha de resultado da pesquisa do LI 35: uma
// linha por resposta. A planilha está com compartilhamento por link, então a
// leitura não precisa de credencial. As colunas de e-mail (A e X) nunca são
// lidas: só B a W (respostas) e Z a AB (UTMs).
const SHEET_ID = "1zcEFVG7Lr9bKlh_pkLiSYYjByI9iyabSNLciQrvg8iM";
const TAB = "Respostas pesquisa";
const DEFAULT_RANGE_DAYS = 7;
const MAX_RANGE_DAYS = 370;
const MAX_SLICES = 6;

const CACHE_HEADERS = {
  "Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "s-maxage=300, stale-while-revalidate=172800",
};

// Cada pergunta: coluna da planilha, título e como agrupar as respostas. Nas de
// texto livre (desejo e objeção) respostas parecidas são somadas.
const QUESTIONS: { key: string; title: string; column: string; free?: boolean }[] = [
  { key: "maquina", title: "Máquina", column: "máquina" },
  { key: "frase", title: "Frase que descreve", column: "frase que descreve" },
  { key: "uso", title: "Uso", column: "uso" },
  { key: "curso", title: "Fez curso?", column: "fez curso?" },
  { key: "desejo", title: "Desejo", column: "desejo", free: true },
  { key: "objecao", title: "Objeção", column: "objeção", free: true },
  { key: "estado", title: "Estado", column: "estado" },
  { key: "idade", title: "Idade", column: "idade" },
  { key: "canal", title: "Por qual canal conheceu a Ju / Silhouette Experts?", column: "por qual canal" },
  { key: "temperatura", title: "Temperatura", column: "temperatura" },
  { key: "renda", title: "Renda", column: "renda" },
  { key: "silhouette", title: "Tem Silhouette", column: "tem_silhouette" },
];

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

async function fetchRange(range: string) {
  const url =
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv` +
    `&sheet=${encodeURIComponent(TAB)}&range=${range}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Não foi possível ler a planilha da pesquisa.");
  return parseCsv(await res.text());
}

// "09/10/2026" -> "2026-10-09"
function isoDate(br: string) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(br.trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function capitalize(s: string) {
  const t = s.trim().replace(/\s+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Agrupa as respostas de uma pergunta: as mais frequentes viram fatias e o resto
// vai para "Outros".
function tally(values: string[], free: boolean) {
  const groups = new Map<string, { count: number; labels: Map<string, number> }>();
  for (const raw of values) {
    const label = raw.trim();
    if (!label) continue;
    const key = free ? normalize(label) : label.toLowerCase();
    if (free && key.length < 2) continue;
    const g = groups.get(key) ?? { count: 0, labels: new Map() };
    g.count++;
    g.labels.set(label, (g.labels.get(label) ?? 0) + 1);
    groups.set(key, g);
  }
  const list = [...groups.values()]
    .map((g) => ({
      label: capitalize([...g.labels].sort((a, b) => b[1] - a[1])[0][0]),
      value: g.count,
    }))
    .sort((a, b) => b.value - a.value);
  if (list.length <= MAX_SLICES + 1) return list;
  const rest = list.slice(MAX_SLICES).reduce((sum, s) => sum + s.value, 0);
  return [...list.slice(0, MAX_SLICES), { label: "Outros", value: rest }];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = resolveRange(searchParams.get("since"), searchParams.get("until"));
    const previous = previousRange(range);
    const fonte = searchParams.get("fonte") ?? "";
    const campanha = searchParams.get("campanha") ?? "";
    const anuncio = searchParams.get("anuncio") ?? "";

    const [answers, utms] = await Promise.all([fetchRange("B:W"), fetchRange("Z:AB")]);
    const head = (answers[0] ?? []).map((h) => h.trim().toLowerCase());
    const col = (re: string) => head.findIndex((h) => h.startsWith(re));
    const iDate = col("data_pesquisa");
    if (iDate < 0) {
      throw new Error("A planilha da pesquisa veio em formato inesperado. Confira se o link continua compartilhado.");
    }
    const uHead = (utms[0] ?? []).map((h) => h.trim().toLowerCase());
    const uSource = uHead.indexOf("utm_source");
    const uCampaign = uHead.indexOf("utm_campaign");
    const uContent = uHead.indexOf("utm_content");
    const qCols = QUESTIONS.map((q) => ({ ...q, index: col(q.column) }));

    type Row = { date: string; fonte: string; campanha: string; anuncio: string; values: string[] };
    const all: Row[] = [];
    for (let i = 1; i < answers.length; i++) {
      const line = answers[i];
      const date = isoDate(line[iDate] ?? "");
      if (!date) continue;
      const u = utms[i] ?? [];
      all.push({
        date,
        fonte: (uSource >= 0 ? u[uSource] : "")?.trim() ?? "",
        campanha: (uCampaign >= 0 ? u[uCampaign] : "")?.trim() ?? "",
        anuncio: (uContent >= 0 ? u[uContent] : "")?.trim() ?? "",
        values: qCols.map((q) => (q.index >= 0 ? line[q.index] ?? "" : "")),
      });
    }

    const inRange = (r: Row, rg: DateRange) => r.date >= rg.since && r.date <= rg.until;
    const current = all.filter((r) => inRange(r, range));
    const options = (get: (r: Row) => string) =>
      [...new Set(current.map(get).filter((v) => v && !/^[{]/.test(v)))].sort((a, b) =>
        a.localeCompare(b, "pt-BR")
      );
    const matches = (r: Row) =>
      (!fonte || r.fonte === fonte) &&
      (!campanha || r.campanha === campanha) &&
      (!anuncio || r.anuncio === anuncio);
    const rows = current.filter(matches);
    const previousRows = all.filter((r) => inRange(r, previous) && matches(r));

    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        range,
        previousRange: previous,
        total: rows.length,
        previousTotal: previousRows.length,
        options: {
          fonte: options((r) => r.fonte),
          campanha: options((r) => r.campanha),
          anuncio: options((r) => r.anuncio),
        },
        questions: qCols.map((q, i) => ({
          key: q.key,
          title: q.title,
          data: tally(rows.map((r) => r.values[i]), !!q.free),
        })),
      },
      { headers: CACHE_HEADERS }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao ler a planilha da pesquisa.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
