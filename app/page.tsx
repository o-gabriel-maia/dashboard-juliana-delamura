"use client";

import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
  Fragment,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  PieChart,
  Pie,
  Cell,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  LayoutDashboard,
  Radio,
  Tag,
  Megaphone,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

type DailyPoint = {
  date: string;
  spend: number;
  conversations: number;
  costPerConversation: number | null;
  impressions: number;
  cpm: number | null;
  ctrLink: number | null;
  cpcLink: number | null;
  conversationRate: number | null;
};

type PieSlice = { label: string; value: number; color?: string };

type Metrics = {
  spend: number;
  conversations: number;
  costPerConversation: number | null;
  firstReplies: number;
  replyRate: number | null;
  impressions: number;
  reach: number | null;
  frequency: number | null;
  cpm: number | null;
  linkClicks: number;
  cpcLink: number | null;
  ctrLink: number | null;
  conversationRate: number | null;
  landingPageViews: number;
  pageClicks: number;
  pageConversions: number;
  loadRate: number | null;
  pageConversionRate: number | null;
  video3SecViews: number;
  hookRate: number | null;
};

type Row = Metrics & {
  id: string;
  campaignId: string;
  name: string;
  parent?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  status?: string;
};

type DateRange = { since: string; until: string };

type DashboardData = {
  updatedAt: string;
  range: DateRange;
  previousRange: DateRange;
  totals: Metrics;
  previousTotals: Metrics;
  previousByCampaign: Record<string, Metrics>;
  // `campaigns` traz uma linha por produto (a aba); `realCampaigns`, as campanhas
  // de verdade dentro de cada produto.
  levels: { campaigns: Row[]; realCampaigns?: Row[]; adsets: Row[]; ads: Row[] };
  dailyChart: DailyPoint[];
  dailyByCampaign: Record<string, DailyPoint[]>;
  stores?: Record<string, { totals: Metrics; previousTotals: Metrics }>;
  resultBreakdowns?: Record<
    string,
    {
      age: PieSlice[];
      gender: PieSlice[];
      placement: PieSlice[];
      device: PieSlice[];
    }
  >;
};

const RESUMO_PANEL = "resumo";
type SortKey = keyof Omit<
  Row,
  "id" | "campaignId" | "parent" | "previewUrl" | "thumbnailUrl" | "imageUrl"
>;

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function formatBRL(value: number | null) {
  if (value === null || isNaN(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNumber(value: number | null) {
  if (value === null || isNaN(value)) return "—";
  return value.toLocaleString("pt-BR");
}

function formatRate(value: number | null) {
  if (value === null || isNaN(value)) return "—";
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatDecimal(value: number | null) {
  if (value === null || isNaN(value)) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatChartDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function formatFullDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatAxisBRL(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

// Datas sempre no fuso de Brasília, pra bater com o dia do Gerenciador.
function toDateStr(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

function lastDays(days: number): DateRange {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  return { since: toDateStr(since), until: toDateStr(new Date()) };
}

const DEFAULT_PRESET = "30dias";

const DATE_PRESETS: {
  key: string;
  label: string;
  range: () => DateRange | null;
}[] = [
  { key: "hoje", label: "Hoje", range: () => lastDays(1) },
  {
    key: "ontem",
    label: "Ontem",
    range: () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return { since: toDateStr(d), until: toDateStr(d) };
    },
  },
  { key: "7dias", label: "Últimos 7 dias", range: () => lastDays(7) },
  { key: "14dias", label: "Últimos 14 dias", range: () => lastDays(14) },
  { key: "30dias", label: "Últimos 30 dias", range: () => lastDays(30) },
  {
    key: "mes",
    label: "Este mês",
    range: () => {
      const today = toDateStr(new Date());
      return { since: `${today.slice(0, 8)}01`, until: today };
    },
  },
  {
    key: "mesPassado",
    label: "Mês passado",
    range: () => {
      const [y, m] = toDateStr(new Date()).split("-").map(Number);
      const first = new Date(Date.UTC(y, m - 2, 1));
      const last = new Date(Date.UTC(y, m - 1, 0));
      return {
        since: first.toISOString().slice(0, 10),
        until: last.toISOString().slice(0, 10),
      };
    },
  },
  { key: "90dias", label: "Últimos 90 dias", range: () => lastDays(90) },
  { key: "personalizado", label: "Personalizado", range: () => null },
];

type FilterState = { preset: string; customSince: string; customUntil: string };

function resolveFilter(filter: FilterState): DateRange | null {
  if (filter.preset === "personalizado") {
    if (filter.customSince && filter.customUntil && filter.customSince <= filter.customUntil) {
      return { since: filter.customSince, until: filter.customUntil };
    }
    return null;
  }
  return DATE_PRESETS.find((p) => p.key === filter.preset)?.range() ?? null;
}

function DateRangeFilter({
  applied,
  onApply,
  loading,
}: {
  applied: FilterState;
  onApply: (filter: FilterState) => void;
  loading?: boolean;
}) {
  const [draft, setDraft] = useState<FilterState>(applied);
  const invalidCustom = draft.preset === "personalizado" && resolveFilter(draft) === null;

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <span className="text-xs font-semibold text-gray-500">Período</span>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative">
          <select
            value={draft.preset}
            onChange={(e) => setDraft({ ...draft, preset: e.target.value })}
            className="appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-4 pr-10 text-sm font-medium text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {DATE_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
        </div>
        <button
          onClick={() => onApply(draft)}
          disabled={loading || invalidCustom}
          className="flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading && (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          )}
          Aplicar filtros
        </button>
      </div>
      {draft.preset === "personalizado" && (
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          <div className="flex flex-col gap-0.5">
            <label className="text-[11px] text-gray-400">Data inicial</label>
            <input
              type="date"
              value={draft.customSince}
              onChange={(e) => setDraft({ ...draft, customSince: e.target.value })}
              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[11px] text-gray-400">Data final</label>
            <input
              type="date"
              value={draft.customUntil}
              onChange={(e) => setDraft({ ...draft, customUntil: e.target.value })}
              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Tira do nome os prefixos que se repetem em todas as campanhas.
function shortName(fullName: string) {
  return fullName.replace(/\s{2,}/g, " ").trim();
}

type NavIcon = ComponentType<{ size?: number; strokeWidth?: number }>;

// Logos de marca não existem no lucide-react, então são SVGs próprios.
// Cada aba é um produto, com seu "resultado" (o campo `conversations` dos dados
// guarda esse resultado: leads ou compras) e seus textos.
type Kind = "ls" | "promo" | "li35";

const KINDS: Record<
  Kind,
  {
    tab: string;
    icon: NavIcon;
    result: string;
    cost: string;
    unit: string;
    // Artigo do resultado nas frases ("os leads", "as compras").
    article: string;
    description: string;
  }
> = {
  ls: {
    tab: "Captação Live Secreta",
    icon: Radio,
    result: "Leads",
    cost: "Custo por Lead",
    unit: "leads",
    article: "os",
    description:
      "Captação de leads para as Lives Secretas: campanhas do Meta Ads (formulário nativo e página de inscrição).",
  },
  promo: {
    tab: "Captação Promo Diária",
    icon: Tag,
    result: "Leads",
    cost: "Custo por Lead",
    unit: "leads",
    article: "os",
    description:
      "Captação de leads para o grupo de Promoções Diárias da Black Friday: campanhas do Meta Ads (formulário nativo e página).",
  },
  li35: {
    tab: "Captação LI 35",
    icon: Megaphone,
    result: "Leads",
    cost: "Custo por Lead",
    unit: "leads",
    article: "os",
    description:
      "Captação de leads do LI 35: primeiro as campanhas do Meta Ads, depois as do Google Ads.",
  },
};
// Todas as abas são de captação: os resumos somam os leads delas.
const LEAD_KIND: Kind = "ls";
const isLeadKind = (kind: Kind) => kind in KINDS;

// O servidor manda uma linha por produto, com o nome da aba.
function kindOf(name: string): Kind {
  if (name === KINDS.promo.tab) return "promo";
  if (name === KINDS.li35.tab) return "li35";
  return "ls";
}

// O dashboard tem um perfil só; o menu não mostra grupo nem resumo de loja.
const STORES = ["Silhouette Experts"] as const;
type Store = (typeof STORES)[number];
const MULTI_STORE = (STORES as readonly string[]).length > 1;
const KIND_ORDER: Kind[] = ["ls", "promo", "li35"];
const STORE_COLORS: Record<Store, string> = {
  "Silhouette Experts": "#2563eb",
};
// Cor fixa de cada produto nas roscas e na tabela do Resumo Geral.
const KIND_COLORS: Record<Kind, string> = {
  ls: "#2563eb",
  promo: "#f59e0b",
  li35: "#7c3aed",
};
const storePanel = (store: Store) => `loja:${store}`;

function storeOf(fullName: string): Store {
  void fullName;
  return "Silhouette Experts";
}

// Nome da campanha fora do menu, onde as lojas aparecem misturadas.
function campaignLabel(fullName: string) {
  const tab = KINDS[kindOf(fullName)].tab;
  return MULTI_STORE ? `${storeOf(fullName)} · ${tab}` : tab;
}

// Totais dos resumos com os leads das campanhas de captação.
function withMessages(totals: Metrics, leadRows: Metrics[]): Metrics {
  const conversations = leadRows.reduce((sum, m) => sum + m.conversations, 0);
  const spend = leadRows.reduce((sum, m) => sum + m.spend, 0);
  const pageClicks = leadRows.reduce((sum, m) => sum + m.pageClicks, 0);
  const pageConversions = leadRows.reduce((sum, m) => sum + m.pageConversions, 0);
  const landingPageViews = leadRows.reduce((sum, m) => sum + m.landingPageViews, 0);
  return {
    ...totals,
    conversations,
    costPerConversation: conversations > 0 ? spend / conversations : null,
    pageClicks,
    pageConversions,
    loadRate: pageClicks > 0 ? (landingPageViews / pageClicks) * 100 : null,
    pageConversionRate: landingPageViews > 0 ? (pageConversions / landingPageViews) * 100 : null,
  };
}

function sliceByStore(rows: Row[], value: (r: Row) => number): PieSlice[] {
  if (!MULTI_STORE) {
    return rows
      .map((r) => ({
        label: KINDS[kindOf(r.name)].tab,
        color: KIND_COLORS[kindOf(r.name)],
        value: value(r),
      }))
      .filter((slice) => slice.value > 0);
  }
  return STORES.map((store) => ({
    label: store,
    color: STORE_COLORS[store],
    value: rows.filter((r) => storeOf(r.name) === store).reduce((sum, r) => sum + value(r), 0),
  })).filter((slice) => slice.value > 0);
}

// Destaca em azul o custo por resultado mais barato (melhor) com mais
// intensidade, e o mais caro quase sem cor.
function heatColor(value: number | null, values: number[]) {
  if (value === null || values.length === 0) return "transparent";
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return "rgba(37,99,235,0.14)";
  const t = 1 - (value - min) / (max - min);
  const alpha = 0.06 + t * 0.26;
  return `rgba(37,99,235,${alpha.toFixed(3)})`;
}

// Explicações em linguagem simples, pra quem não é da área de tráfego.
const METRIC_HELP: Record<string, string> = {
  "Valor Investido": "Quanto foi gasto em anúncios no período.",
  Leads:
    "Cadastros feitos por pessoas que vieram dos anúncios, contados pela Meta (a mesma coluna Resultados do Gerenciador de Anúncios).",
  "Custo por Lead": "Valor investido dividido pelo número de leads. Quanto menor, melhor.",
  Resultados:
    "O objetivo de cada campanha: leads, ou seja, cadastros feitos por quem viu os anúncios.",
  "Custo por Resultado":
    "Valor investido dividido pelo resultado da campanha. Só dá para comparar campanhas do mesmo tipo.",
  Alcance: "Quantas pessoas diferentes viram os anúncios pelo menos uma vez.",
  Impressões:
    "Quantas vezes os anúncios apareceram na tela. A mesma pessoa pode ver mais de uma vez.",
  Frequência: "Em média, quantas vezes cada pessoa viu os anúncios (impressões ÷ alcance).",
  CPM: "Custo para os anúncios aparecerem mil vezes. Mostra se a mídia está cara ou barata.",
  "CTR (link)": "De cada 100 vezes que o anúncio apareceu, quantas viraram clique no link.",
  CTR: "De cada 100 vezes que o anúncio apareceu, quantas viraram clique no link.",
  "Taxa de Carregamento":
    "De cada 100 cliques no link, quantos esperaram a página abrir (visualizações da página ÷ cliques). Taxa baixa costuma indicar página lenta.",
  "Taxa de Conversão da Página":
    "De cada 100 pessoas que abriram a página, quantas viraram lead ou compra (resultados ÷ visualizações da página).",
  Cliques: "Cliques no link ou no botão do anúncio.",
  CPC: "Custo médio de cada clique no link.",
  Status: "Se a campanha, o conjunto ou o anúncio está rodando ou pausado.",
};

// "?" ao lado do nome da métrica; a explicação abre ao passar o mouse ou tocar.
// O balão ocupa a largura do card (o pai precisa ser `relative`), pra não vazar da tela.
function InfoTip({ label }: { label: string }) {
  const help = METRIC_HELP[label];
  if (!help) return null;
  return (
    <span className="group/tip ml-1 inline-block align-middle">
      <button
        type="button"
        aria-label={`O que é ${label}?`}
        className="flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-gray-300 text-[9px] font-bold leading-none text-gray-400 hover:border-gray-500 hover:text-gray-600 focus:border-blue-500 focus:text-blue-600 focus:outline-none"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute inset-x-2 top-9 z-20 hidden rounded-lg bg-gray-900 px-3 py-2 text-left text-xs font-normal leading-snug tracking-normal text-white shadow-lg group-focus-within/tip:block group-hover/tip:block"
      >
        {help}
      </span>
    </span>
  );
}

// Versão do "?" para cabeçalho de tabela. A tabela rola dentro de uma caixa que
// cortaria um balão comum, então este é posicionado na tela (fixed) a partir do botão.
function HeaderTip({ label }: { label: string }) {
  const help = METRIC_HELP[label];
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const open = pos !== null;

  // A posição é calculada na hora de abrir; se a página ou a tabela rolar, o balão
  // ficaria solto no lugar antigo, então ele fecha.
  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  if (!help) return null;

  const WIDTH = 224;
  const show = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - WIDTH / 2),
      window.innerWidth - WIDTH - 8,
    );
    setPos({ left, top: rect.bottom + 6 });
  };

  return (
    <>
      <button
        type="button"
        aria-label={`O que é ${label}?`}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={() => setPos(null)}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={() => setPos(null)}
        className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-gray-300 align-middle text-[9px] font-bold leading-none text-gray-400 hover:border-gray-500 hover:text-gray-600 focus:border-blue-500 focus:text-blue-600 focus:outline-none"
      >
        ?
      </button>
      {pos && (
        <span
          role="tooltip"
          style={{ left: pos.left, top: pos.top, width: WIDTH }}
          className="pointer-events-none fixed z-50 rounded-lg bg-gray-900 px-3 py-2 text-left text-xs font-normal leading-snug tracking-normal whitespace-normal text-white shadow-lg"
        >
          {help}
        </span>
      )}
    </>
  );
}

function useIsNarrow() {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );
}

// "up": subir é bom (verde). "down": subir é ruim (custo). "neutral": sem juízo.
type Trend = "up" | "down" | "neutral";

function Kpi({
  label,
  value,
  current,
  previous,
  previousLabel,
  trend,
  className = "",
}: {
  label: string;
  value: string;
  current: number | null;
  previous: number | null;
  previousLabel: string;
  trend: Trend;
  className?: string;
}) {
  const comparable = current !== null && previous !== null && previous > 0;
  const change = comparable ? ((current - previous) / previous) * 100 : null;
  const rounded = change === null ? null : Math.round(change * 100) / 100;

  let tone = "text-gray-500";
  if (rounded !== null && rounded !== 0 && trend !== "neutral") {
    const improved = trend === "up" ? rounded > 0 : rounded < 0;
    tone = improved ? "text-emerald-600" : "text-red-600";
  }

  return (
    <div
      className={`relative rounded-xl border border-gray-200 bg-white p-4 text-center shadow-sm ${className}`}
    >
      <div className="mb-1.5 text-xs tracking-wide text-gray-500">
        {label}
        <InfoTip label={label} />
      </div>
      <div className="font-sans text-lg font-extrabold text-gray-900 sm:text-xl">{value}</div>
      <div
        className={`mt-1 text-xs font-semibold ${tone}`}
        title={`Período anterior: ${previousLabel}`}
      >
        {rounded === null ? (
          <span className="font-normal text-gray-400">sem comparação</span>
        ) : (
          <>
            {rounded > 0 ? "▲" : rounded < 0 ? "▼" : "="}{" "}
            {Math.abs(rounded).toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            %
          </>
        )}
      </div>
    </div>
  );
}

// Variação percentual contra o período anterior; null quando não há base.
function changeOf(current: number | null, previous: number | null | undefined) {
  if (current === null || previous === null || previous === undefined || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

// "subiu 12,34%", "caiu 5,00%" ou "ficou estável" (variação menor que 1%).
function describeChange(change: number, plural = false) {
  if (Math.abs(change) < 1) return plural ? "ficaram estáveis" : "ficou estável";
  const verb = change > 0 ? (plural ? "subiram" : "subiu") : plural ? "caíram" : "caiu";
  return `${verb} ${formatRate(Math.abs(change))}`;
}

// Anotações automáticas sobre como as métricas dos cards se relacionam, em
// linguagem simples. `mixed` marca os resumos (geral e de loja), onde o valor
// investido inclui campanhas que não geram o resultado do card.
function buildNotes(kind: Kind, totals: Metrics, previous: Metrics | undefined) {
  if (!previous) return [];
  const notes: string[] = [];
  const result = KINDS[kind].result.toLocaleLowerCase("pt-BR");
  const article = KINDS[kind].article;
  const cost = KINDS[kind].cost.toLocaleLowerCase("pt-BR");

  const spend = changeOf(totals.spend, previous.spend);
  const results = changeOf(totals.conversations, previous.conversations);
  const costChange = changeOf(totals.costPerConversation, previous.costPerConversation);
  if (spend !== null && results !== null && costChange !== null) {
    const verdict =
      Math.abs(costChange) < 1
        ? "O dinheiro rendeu praticamente o mesmo que no período anterior."
        : costChange < 0
          ? "Cada real investido rendeu mais do que no período anterior."
          : "Cada real investido rendeu menos do que no período anterior.";
    notes.push(
      `O investimento ${describeChange(spend)} e ${article} ${result} ${describeChange(results, true)}; por isso o ${cost} ${describeChange(costChange)}. ${verdict}`,
    );
  }

  const cpm = changeOf(totals.cpm, previous.cpm);
  const impressions = changeOf(totals.impressions, previous.impressions);
  const reach = changeOf(totals.reach, previous.reach);
  if (cpm !== null && impressions !== null && reach !== null) {
    if (cpm >= 1 && impressions <= -1) {
      notes.push(
        `O CPM ${describeChange(cpm)}: ficou mais caro aparecer para o público. Com isso o mesmo dinheiro comprou menos exposição: as impressões ${describeChange(impressions, true)} e o alcance ${describeChange(reach)}.`,
      );
    } else if (cpm <= -1 && impressions >= 1) {
      notes.push(
        `O CPM ${describeChange(cpm)}: ficou mais barato aparecer para o público. Com isso o mesmo dinheiro comprou mais exposição: as impressões ${describeChange(impressions, true)} e o alcance ${describeChange(reach)}.`,
      );
    } else {
      notes.push(
        `O CPM ${describeChange(cpm)}, as impressões ${describeChange(impressions, true)} e o alcance ${describeChange(reach)}. Impressões e alcance acompanham o valor investido e o preço da mídia (CPM).`,
      );
    }
  }

  const ctr = changeOf(totals.ctrLink, previous.ctrLink);
  if (ctr !== null && (totals.ctrLink ?? 0) > 0) {
    if (ctr >= 1) {
      notes.push(
        `O CTR ${describeChange(ctr)}: de quem viu os anúncios, uma parte maior clicou. Anúncio que chama mais atenção ajuda a segurar o ${cost}, mesmo quando a mídia fica mais cara.`,
      );
    } else if (ctr <= -1) {
      notes.push(
        `O CTR ${describeChange(ctr)}: de quem viu os anúncios, uma parte menor clicou. Quando isso acontece o ${cost} tende a subir, e costuma ser sinal de que vale renovar os criativos.`,
      );
    } else {
      notes.push("O CTR ficou estável: os anúncios seguem chamando a mesma atenção de antes.");
    }
  }

  if (totals.frequency !== null && totals.frequency >= 3) {
    notes.push(
      `Cada pessoa viu os anúncios em média ${formatDecimal(totals.frequency)} vezes no período. Acima de 3, o público começa a cansar dos mesmos anúncios, o que costuma derrubar o CTR.`,
    );
  }
  return notes;
}

function KpiGrid({
  totals,
  previous,
  previousRange,
  kind,
}: {
  kind: Kind;
  totals: Metrics;
  previous: Metrics | undefined;
  previousRange: DateRange;
}) {
  type Card = {
    label: string;
    trend: Trend;
    get: (m: Metrics) => number | null;
    format: (v: number | null) => string;
  };
  const cards: Card[] = [
    {
      label: "Valor Investido",
      trend: "up",
      get: (m) => m.spend,
      format: formatBRL,
    },
    {
      label: KINDS[kind].result,
      trend: "up",
      get: (m) => m.conversations,
      format: formatNumber,
    },
    {
      label: KINDS[kind].cost,
      trend: "down",
      get: (m) => m.costPerConversation,
      format: formatBRL,
    },
    {
      label: "Alcance",
      trend: "up",
      get: (m) => m.reach,
      format: formatNumber,
    },
    {
      label: "Impressões",
      trend: "up",
      get: (m) => m.impressions,
      format: formatNumber,
    },
    { label: "CPM", trend: "down", get: (m) => m.cpm, format: formatBRL },
    {
      label: "CTR (link)",
      trend: "up",
      get: (m) => m.ctrLink,
      format: formatRate,
    },
  ];
  cards.push(
    { label: "Taxa de Carregamento", trend: "up", get: (m) => m.loadRate, format: formatRate },
    {
      label: "Taxa de Conversão da Página",
      trend: "up",
      get: (m) => m.pageConversionRate,
      format: formatRate,
    },
  );
  const notes = buildNotes(kind, totals, previous);
  const top: Card[] = cards.slice(0, 3);
  const render = (card: Card, index: number, list: Card[]) => {
    const current = card.get(totals);
    const prev = previous ? card.get(previous) : null;
    return (
      <Kpi
        key={card.label}
        label={card.label}
        value={card.format(current)}
        current={current}
        previous={prev}
        previousLabel={card.format(prev)}
        trend={card.trend}
        // No celular a linha com número ímpar de cards vira 1 card largo + pares lado a lado.
        className={
          list.length % 2 === 1 && index === 0
            ? "col-span-2 sm:col-span-1"
            : ""
        }
      />
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {top.map(render)}
      </div>
      <div
        className="grid grid-cols-2 gap-3 md:grid-cols-3"
      >
        {cards.slice(3).map(render)}
      </div>
      <p className="text-xs text-gray-500">
        Variação em relação ao período anterior ({formatFullDate(previousRange.since)} a{" "}
        {formatFullDate(previousRange.until)}).
      </p>
      {notes.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">
            Anotações
            <span className="font-normal text-gray-400">
              {" "}
              (como esses números se relacionam, comparando com o período anterior)
            </span>
          </h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-gray-700">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-gray-400">—</span>;
  const isActive = status === "Ativo";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
        isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
      }`}
    >
      {status}
    </span>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
  valueFormatter: (value: number, name?: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-gray-900">{label ? formatChartDate(label) : ""}</div>
      {payload.map((item) => (
        <div key={item.name} className="flex items-center gap-1.5 text-gray-500">
          <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
          {item.name}:{" "}
          <span className="font-semibold text-gray-900">
            {valueFormatter(item.value ?? 0, item.name)}
          </span>
        </div>
      ))}
    </div>
  );
}

const AXIS_TICK = { fill: "#6b7280", fontSize: 11 };
const AXIS_LINE = { stroke: "#d1d5db" };

function ChartNote({ note }: { note?: string }) {
  if (!note) return null;
  return <span className="font-normal text-gray-400"> {note}</span>;
}

function InvestimentoConversasChart({
  data,
  kind,
  note,
}: {
  data: DailyPoint[];
  kind: Kind;
  note?: string;
}) {
  const countName = KINDS[kind].result;
  const costName = KINDS[kind].cost;
  // No celular os eixos Y somem pra sobrar largura pro gráfico; os valores ficam no toque.
  const narrow = useIsNarrow();
  return (
    <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">
        Investimento, {countName} e {costName} por Dia
        <ChartNote note={note} />
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e5e7eb" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartDate}
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={false}
            minTickGap={16}
          />
          <YAxis
            yAxisId="money"
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={false}
            tickFormatter={formatAxisBRL}
            width={72}
            hide={narrow}
          />
          <YAxis
            yAxisId="count"
            orientation="right"
            allowDecimals={false}
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={false}
            tickFormatter={(v: number) => formatNumber(v)}
            width={48}
            hide={narrow}
          />
          <YAxis yAxisId="cost" orientation="right" width={0} domain={[0, "auto"]} hide />
          <Tooltip
            content={
              <ChartTooltip
                valueFormatter={(v, name) => (name === countName ? formatNumber(v) : formatBRL(v))}
              />
            }
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "#6b7280" }} />
          <Bar
            yAxisId="money"
            dataKey="spend"
            name="Valor Investido"
            fill="#2563eb"
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
          />
          <Bar
            yAxisId="count"
            dataKey="conversations"
            name={countName}
            fill="#f59e0b"
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
          />
          <Line
            yAxisId="cost"
            type="monotone"
            dataKey="costPerConversation"
            name={costName}
            stroke="#7c3aed"
            strokeWidth={2}
            dot={{ r: 3, fill: "#7c3aed", stroke: "#ffffff", strokeWidth: 2 }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Ordem fixa das séries na legenda e no tooltip. Sem tipo (Resumo Geral) ficam
// só as métricas de mídia, sem as duas séries de resultado.
type MetricLine = {
  key: keyof DailyPoint;
  name: string;
  color: string;
  axis: "money" | "percent" | "count";
  format: (v: number) => string;
};

function metricLines(kind?: Kind): MetricLine[] {
  const media: MetricLine[] = [
    {
      key: "cpm",
      name: "CPM",
      color: "#2563eb",
      axis: "money",
      format: formatBRL,
    },
    {
      key: "cpcLink",
      name: "CPC",
      color: "#f59e0b",
      axis: "money",
      format: formatBRL,
    },
    {
      key: "ctrLink",
      name: "CTR",
      color: "#059669",
      axis: "percent",
      format: formatRate,
    },
  ];
  if (!kind) return media;
  return [
    ...media,
    {
      key: "conversations",
      name: KINDS[kind].result,
      color: "#db2777",
      axis: "count",
      format: formatNumber,
    },
    {
      key: "costPerConversation",
      name: KINDS[kind].cost,
      color: "#7c3aed",
      axis: "money",
      format: formatBRL,
    },
  ];
}

function MetricasChart({ data, kind, note }: { data: DailyPoint[]; kind?: Kind; note?: string }) {
  const narrow = useIsNarrow();
  const lines = metricLines(kind);
  const order = new Map(lines.map((l, i) => [l.name, i]));
  return (
    <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">
        {lines
          .map((l) => l.name)
          .join(", ")
          .replace(/, ([^,]*)$/, " e $1")}{" "}
        por Dia
        <ChartNote note={note} />
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e5e7eb" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartDate}
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={false}
            minTickGap={16}
          />
          <YAxis
            yAxisId="money"
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={false}
            tickFormatter={formatAxisBRL}
            width={72}
            hide={narrow}
          />
          <YAxis
            yAxisId="percent"
            orientation="right"
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={false}
            tickFormatter={(v: number) => `${v}%`}
            width={48}
            hide={narrow}
          />
          <YAxis yAxisId="count" orientation="right" width={0} domain={[0, "auto"]} hide />
          <Tooltip
            itemSorter={(item) => order.get(String(item.name)) ?? 0}
            content={
              <ChartTooltip
                valueFormatter={(v, name) =>
                  (lines.find((l) => l.name === name)?.format ?? formatBRL)(v)
                }
              />
            }
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: "#6b7280" }}
            itemSorter={(item) => order.get(String(item.value)) ?? 0}
          />
          {lines.map((l) => (
            <Line
              key={l.key}
              yAxisId={l.axis}
              type="monotone"
              dataKey={l.key}
              name={l.name}
              stroke={l.color}
              strokeWidth={2}
              dot={{ r: 3, fill: l.color, stroke: "#ffffff", strokeWidth: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const PIE_COLORS = ["#2563eb", "#f59e0b", "#7c3aed", "#059669", "#9ca3af", "#db2777", "#0891b2"];

function DonutChart({
  title,
  description,
  data,
  centerLabel,
  format,
}: {
  title: string;
  description: string;
  data: PieSlice[];
  centerLabel: string;
  format: (value: number) => string;
}) {
  // Fatia em destaque (mouse sobre a rosca ou sobre a legenda): o centro passa
  // a mostrar essa fatia, em vez de abrir um tooltip por cima do total.
  const [active, setActive] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const share = (value: number) => (total > 0 ? formatRate((value / total) * 100) : "0,00%");
  const current = active !== null ? data[active] : undefined;

  return (
    <div className="@container rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-bold text-gray-900">{title}</h3>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
      {/* Em card estreito a legenda vai pra baixo da rosca, pra não cortar os nomes. */}
      <div className="mt-4 flex flex-col items-center gap-5 @lg:flex-row">
        <div className="relative h-[190px] w-[190px] flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius={66}
                outerRadius={90}
                paddingAngle={data.length > 1 ? 2 : 0}
                stroke="none"
                isAnimationActive={false}
                onMouseEnter={(_, index) => setActive(index)}
                onMouseLeave={() => setActive(null)}
              >
                {data.map((_, i) => (
                  <Cell
                    key={i}
                    fill={data[i].color ?? PIE_COLORS[i % PIE_COLORS.length]}
                    opacity={active === null || active === i ? 1 : 0.3}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-9 text-center">
            {current ? (
              <>
                <div className="max-w-full truncate text-[11px] font-semibold text-gray-600">
                  {current.label}
                </div>
                <div className="text-[15px] font-extrabold leading-tight text-gray-900">
                  {format(current.value)}
                </div>
                <div className="text-xs text-gray-500">{share(current.value)}</div>
              </>
            ) : (
              <>
                <div className="text-[15px] font-extrabold leading-tight text-gray-900">
                  {format(total)}
                </div>
                <div className="text-xs text-gray-500">{centerLabel}</div>
              </>
            )}
          </div>
        </div>
        <div className="w-full min-w-0 flex-1 space-y-1">
          {data.map((d, i) => (
            <div
              key={d.label}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              className={`flex items-center justify-between gap-3 rounded-md px-2 py-1 text-sm transition-colors ${
                active === i ? "bg-gray-100" : ""
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ background: d.color ?? PIE_COLORS[i % PIE_COLORS.length] }}
                />
                <span className="break-words font-medium leading-tight text-gray-700">
                  {d.label}
                </span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2.5">
                <span className="font-bold text-gray-900">{format(d.value)}</span>
                <span className="w-14 text-right text-gray-500">{share(d.value)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PanelHeader({
  title,
  description,
  filter,
  onApplyFilter,
  loading,
}: {
  title: string;
  description: string;
  filter: FilterState;
  onApplyFilter: (filter: FilterState) => void;
  loading: boolean;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-gray-200 pb-3 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <h2 className="font-sans text-2xl font-extrabold text-gray-900">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">{description}</p>
      </div>
      <div className="flex flex-shrink-0 flex-wrap items-end gap-4 xl:justify-end">
        <DateRangeFilter applied={filter} onApply={onApplyFilter} loading={loading} />
      </div>
    </div>
  );
}

// A linha de total não tem `name`: é assim que as colunas de resultado do Resumo
// Geral sabem que ali não há o que somar.
type Column = {
  key: SortKey;
  label: string;
  format: (r: Metrics & { status?: string; name?: string }) => string;
};

// "Pausados" inclui anúncio pausado por conta própria, pelo conjunto ou pela campanha.
const STATUS_FILTERS: {
  key: string;
  label: string;
  match?: (status?: string) => boolean;
}[] = [
  { key: "todos", label: "Todos os status" },
  { key: "ativos", label: "Ativos", match: (status) => status === "Ativo" },
  {
    key: "pausados",
    label: "Pausados",
    match: (status) => !!status?.startsWith("Pausado"),
  },
];

// Miniatura do criativo na tabela; clicar abre a imagem ampliada por cima da tela.
// As imagens vêm da CDN da Meta com URL temporária, por isso <img> em vez de next/image.
function AdPreview({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const adLink = row.previewUrl ? (
    <a
      href={row.previewUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 hover:underline"
    >
      Ver anúncio
    </a>
  ) : null;

  if (!row.thumbnailUrl) return adLink ?? <span className="text-gray-400">—</span>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ampliar imagem"
        className="inline-block cursor-zoom-in rounded-md transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={row.thumbnailUrl}
          alt={`Prévia do anúncio ${row.name}`}
          loading="lazy"
          className="h-[72px] w-[72px] rounded-md border border-gray-200 object-cover"
        />
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Imagem do anúncio ${row.name}`}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/75 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full max-w-full cursor-default flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-2.5 text-left">
              <div className="min-w-0 truncate text-sm font-semibold text-gray-900">{row.name}</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="flex-shrink-0 rounded-md px-2 py-0.5 text-lg leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              >
                ×
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={row.imageUrl || row.thumbnailUrl}
              alt={`Imagem do anúncio ${row.name}`}
              className="max-h-[75vh] w-auto max-w-[90vw] object-contain"
            />
            {adLink && <div className="border-t border-gray-200 px-4 py-2.5 text-sm">{adLink}</div>}
          </div>
        </div>
      )}
    </>
  );
}

const ESSENTIAL_COLUMNS = new Set<SortKey>([
  "status",
  "spend",
  "conversations",
  "costPerConversation",
  "reach",
  "impressions",
  "ctrLink",
  "loadRate",
  "pageConversionRate",
]);

function LevelTable({
  title,
  rows,
  nameLabel,
  formatName = shortName,
  searchable,
  totalReach,
  showPreviewLink,
  kind,
  dotColor,
  hideColumns,
}: {
  // Colunas que a origem dos dados não tem (o Google Ads não informa alcance).
  hideColumns?: SortKey[];
  // Bolinha colorida antes do nome (cor da loja), quando a tabela mistura lojas.
  dotColor?: (name: string) => string;
  // Sem tipo (Resumo Geral) a tabela mistura campanhas de tipos diferentes.
  kind?: Kind;
  title: string;
  rows: Row[];
  nameLabel: string;
  formatName?: (name: string) => string;
  searchable?: boolean;
  // Alcance real (sem duplicar pessoas) do conjunto de linhas da tabela.
  totalReach: number | null;
  showPreviewLink?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchesStatus = STATUS_FILTERS.find((f) => f.key === statusFilter)?.match;
    const list = rows.filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q)) && (!matchesStatus || matchesStatus(r.status)),
    );
    return [...list].sort((a, b) => {
      const av = a[sortKey] ?? null;
      const bv = b[sortKey] ?? null;
      if (typeof av === "string" || typeof bv === "string") {
        const cmp = String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR");
        return sortDir === "asc" ? cmp : -cmp;
      }
      const an = av === null ? -Infinity : av;
      const bn = bv === null ? -Infinity : bv;
      return sortDir === "asc" ? an - bn : bn - an;
    });
  }, [rows, search, statusFilter, sortKey, sortDir]);

  const costs = rows.map((r) => r.costPerConversation).filter((v): v is number => v !== null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // O total do Resumo Geral mistura abas diferentes: sem taxas da página nele.
  const hasPage = (r: { name?: string }) => (kind ? true : !!r.name);
  const columns: Column[] = [
    { key: "status", label: "Status", format: (r) => r.status || "—" },
    {
      key: "spend",
      label: "Valor Investido",
      format: (r) => formatBRL(r.spend),
    },
    kind
      ? {
          key: "conversations",
          label: KINDS[kind].result,
          format: (r) => formatNumber(r.conversations),
        }
      : {
          key: "conversations",
          label: "Resultados",
          format: (r) =>
            r.name ? `${formatNumber(r.conversations)} ${KINDS[kindOf(r.name)].unit}` : "—",
        },
    {
      key: "costPerConversation",
      label: kind ? KINDS[kind].cost : "Custo por Resultado",
      format: (r) => (kind || r.name ? formatBRL(r.costPerConversation) : "—"),
    },
    { key: "reach", label: "Alcance", format: (r) => formatNumber(r.reach) },
    {
      key: "impressions",
      label: "Impressões",
      format: (r) => formatNumber(r.impressions),
    },
    {
      key: "frequency",
      label: "Frequência",
      format: (r) => formatDecimal(r.frequency),
    },
    { key: "cpm", label: "CPM", format: (r) => formatBRL(r.cpm) },
    {
      key: "linkClicks",
      label: "Cliques",
      format: (r) => formatNumber(r.linkClicks),
    },
    { key: "cpcLink", label: "CPC", format: (r) => formatBRL(r.cpcLink) },
    { key: "ctrLink", label: "CTR", format: (r) => formatRate(r.ctrLink) },
    {
      key: "loadRate",
      label: "Taxa de Carregamento",
      format: (r) => formatRate(hasPage(r) ? r.loadRate : null),
    },
    {
      key: "pageConversionRate",
      label: "Taxa de Conversão da Página",
      format: (r) => formatRate(hasPage(r) ? r.pageConversionRate : null),
    },
  ];

  // Por padrão só as colunas que o cliente acompanha; as demais ficam a um clique.
  const available = columns.filter((c) => !hideColumns?.includes(c.key));
  const visibleColumns = showAll ? available : available.filter((c) => ESSENTIAL_COLUMNS.has(c.key));
  const minWidth = 256 + (showPreviewLink ? 96 : 0) + visibleColumns.length * 112;

  // Com busca ativa a tabela mostra só parte das linhas, e o alcance real dessa
  // parte não é conhecido (somar contaria a mesma pessoa mais de uma vez).
  const summary =
    filtered.length > 0
      ? computeSummary(filtered, filtered.length === rows.length ? totalReach : null)
      : null;
  const emphasize = (key: SortKey) => key === "conversations" || key === "costPerConversation";

  return (
    <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-blue-500 hover:text-blue-600"
          >
            {showAll ? "Ver menos colunas" : "Ver todas as colunas"}
          </button>
        </div>
        {searchable && (
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filtrar por status"
                className="appearance-none rounded-lg border border-gray-300 bg-white py-2 pl-3.5 pr-9 text-sm font-medium text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {STATUS_FILTERS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Buscar ${nameLabel.toLowerCase()}...`}
              className="w-56 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full table-fixed text-sm" style={{ minWidth }}>
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr className="border-b border-gray-200 text-xs tracking-wide text-gray-500">
              <th
                onClick={() => toggleSort("name")}
                className="sticky left-0 z-20 w-40 cursor-pointer whitespace-nowrap bg-gray-50 px-2.5 py-2.5 text-left shadow-[1px_0_0_#e5e7eb] select-none hover:text-blue-600 md:w-64"
              >
                {nameLabel}
                {sortKey === "name" && (sortDir === "asc" ? " ▲" : " ▼")}
              </th>
              {showPreviewLink && (
                <th className="w-24 whitespace-nowrap px-2.5 py-2.5 text-center">Prévia</th>
              )}
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="w-28 cursor-pointer px-2.5 py-2.5 text-center select-none hover:text-blue-600"
                >
                  {col.label}
                  <HeaderTip label={col.label} />
                  {sortKey === col.key && (sortDir === "asc" ? " ▲" : " ▼")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr
                key={row.id}
                className={`border-b border-gray-100 transition-colors hover:bg-blue-50 ${
                  i % 2 === 1 ? "bg-gray-50" : "bg-white"
                }`}
              >
                <td
                  className="sticky left-0 z-[1] w-40 break-words bg-inherit px-2.5 py-2.5 text-left font-medium text-gray-900 shadow-[1px_0_0_#e5e7eb] md:w-64"
                  title={row.name}
                >
                  {dotColor && (
                    <span
                      className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                      style={{ background: dotColor(row.name) }}
                    />
                  )}
                  {formatName(row.name)}
                </td>
                {showPreviewLink && (
                  <td className="w-24 px-2.5 py-2 text-center">
                    <AdPreview row={row} />
                  </td>
                )}
                {visibleColumns.map((col) => (
                  <td
                    key={col.key}
                    className={`w-28 px-2.5 py-2.5 text-center ${
                      emphasize(col.key) ? "font-semibold text-amber-600" : "text-gray-900"
                    }`}
                    style={{
                      background:
                        kind && col.key === "costPerConversation"
                          ? heatColor(row.costPerConversation, costs)
                          : undefined,
                    }}
                  >
                    {col.key === "status" ? <StatusBadge status={row.status} /> : col.format(row)}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={visibleColumns.length + 1 + (showPreviewLink ? 1 : 0)}
                  className="px-2.5 py-6 text-center text-gray-400"
                >
                  {rows.length > 0
                    ? "Nenhum resultado para os filtros aplicados."
                    : "Nenhum resultado no período selecionado."}
                </td>
              </tr>
            )}
            {summary && filtered.length > 1 && (
              <tr className="sticky bottom-0 z-10 border-t-2 border-blue-200 bg-blue-50 font-semibold">
                <td className="sticky left-0 bg-inherit px-2.5 py-2.5 text-left text-gray-900 shadow-[1px_0_0_#e5e7eb]">
                  Total
                </td>
                {showPreviewLink && <td className="px-2.5 py-2.5 text-center text-gray-400">—</td>}
                {visibleColumns.map((col) => (
                  <td key={col.key} className="px-2.5 py-2.5 text-center text-gray-900">
                    {col.format(summary)}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// O alcance do total não é a soma das linhas (a mesma pessoa pode ser alcançada
// por várias delas): vem pronto da Meta para a campanha ou a conta inteira.
function computeSummary(rows: Row[], reach: number | null): Metrics {
  const sum = (fn: (r: Row) => number) => rows.reduce((s, r) => s + fn(r), 0);
  const spend = sum((r) => r.spend);
  const conversations = sum((r) => r.conversations);
  const firstReplies = sum((r) => r.firstReplies);
  const impressions = sum((r) => r.impressions);
  const linkClicks = sum((r) => r.linkClicks);
  const landingPageViews = sum((r) => r.landingPageViews);
  const pageClicks = sum((r) => r.pageClicks);
  const pageConversions = sum((r) => r.pageConversions);
  const video3SecViews = sum((r) => r.video3SecViews);

  return {
    spend,
    conversations,
    costPerConversation: conversations > 0 ? spend / conversations : null,
    firstReplies,
    replyRate: conversations > 0 ? (firstReplies / conversations) * 100 : null,
    impressions,
    reach,
    frequency: reach !== null && reach > 0 ? impressions / reach : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    linkClicks,
    cpcLink: linkClicks > 0 ? spend / linkClicks : null,
    ctrLink: impressions > 0 ? (linkClicks / impressions) * 100 : null,
    conversationRate: linkClicks > 0 ? (conversations / linkClicks) * 100 : null,
    landingPageViews,
    pageClicks,
    pageConversions,
    loadRate: pageClicks > 0 ? (landingPageViews / pageClicks) * 100 : null,
    pageConversionRate: landingPageViews > 0 ? (pageConversions / landingPageViews) * 100 : null,
    video3SecViews,
    hookRate: impressions > 0 ? (video3SecViews / impressions) * 100 : null,
  };
}

// `fresh` fura o cache da CDN e busca direto na Meta (~10s). Sem ele a resposta
// vem do cache em milissegundos, podendo ter alguns minutos de idade.
async function fetchDashboard(range: DateRange | null, fresh: boolean): Promise<DashboardData> {
  const params = new URLSearchParams(range ?? {});
  if (fresh) params.set("fresh", String(Date.now()));
  const res = await fetch(`/api/dashboard?${params.toString()}`, {
    cache: "no-store",
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

const STALE_RETRY_MS = 10 * 1000;
const MAX_STALE_RETRIES = 4;
const LAST_DATA_KEY = "silhouette-experts-dashboard:ultimos-dados";

// Conveniência: guarda a última resposta boa pra tela não ficar vazia se a Meta
// recusar uma consulta (ex.: limite de requisições).
function saveLastData(data: DashboardData) {
  try {
    localStorage.setItem(LAST_DATA_KEY, JSON.stringify(data));
  } catch {
    // Sem espaço ou sem permissão de armazenamento: segue sem o reforço.
  }
}

function readLastData(): DashboardData | null {
  try {
    const raw = localStorage.getItem(LAST_DATA_KEY);
    return raw ? (JSON.parse(raw) as DashboardData) : null;
  } catch {
    return null;
  }
}

function friendlyError(e: unknown) {
  const message = e instanceof Error ? e.message : "";
  if (/request limit|rate limit|too many calls/i.test(message)) {
    return "A Meta limitou temporariamente as consultas desta conta de anúncios. O dashboard volta a atualizar sozinho em alguns minutos.";
  }
  return message ? `Erro ao carregar: ${message}` : "Erro ao carregar os dados.";
}

const NARROW_QUERY = "(max-width: 767px)";

function subscribeNarrow(callback: () => void) {
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(true);
  // Dados na tela são de outro período (filtro recém-trocado): esmaece até chegar o novo.
  const [stale, setStale] = useState(false);
  const [lastRefreshMs, setLastRefreshMs] = useState<number | null>(null);
  const [panel, setPanel] = useState(RESUMO_PANEL);
  const [closedStores, setClosedStores] = useState<Store[]>([]);
  // O menu lateral só existe do tablet pra cima; no celular vira a barra do topo.
  const [sidebarChoice, setSidebarChoice] = useState<boolean | null>(null);
  const sidebarCollapsed = sidebarChoice ?? false;
  const [lastLoadAt, setLastLoadAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<FilterState>({
    preset: DEFAULT_PRESET,
    customSince: "",
    customUntil: "",
  });
  const filterRef = useRef(filter);
  const staleRetries = useRef(0);

  const load = useCallback(async (fresh: boolean) => {
    const start = performance.now();
    let nextDelay = REFRESH_INTERVAL_MS;
    try {
      // O período padrão vai sem datas na URL: assim o endereço é sempre o mesmo e a
      // cópia guardada na CDN serve de um dia pro outro (o servidor calcula as datas).
      const isDefault = filterRef.current.preset === DEFAULT_PRESET;
      if (isDefault && !fresh) {
        // Abre na hora com os últimos dados vistos neste navegador, enquanto busca os novos.
        const saved = readLastData();
        if (saved) {
          setData((current) => current ?? saved);
          setLoading(false);
        }
      }
      const json = await fetchDashboard(isDefault ? null : resolveFilter(filterRef.current), fresh);
      setError(null);
      // Nunca troca dados mais novos por uma cópia mais antiga do mesmo período.
      setData((current) =>
        current &&
        current.range.since === json.range.since &&
        current.range.until === json.range.until &&
        current.updatedAt > json.updatedAt
          ? current
          : json,
      );
      if (isDefault) saveLastData(json);
      setLastRefreshMs(performance.now() - start);
      // Cópia do cache com mais de 5 min: a CDN já está buscando a nova por trás,
      // então basta pedir de novo em instantes (sem outra rodada de consultas à Meta).
      // Poucas tentativas seguidas: se a nova não chegar (Meta fora do ar ou
      // limitando), volta ao ritmo normal.
      const isStale = Date.now() - Date.parse(json.updatedAt) > REFRESH_INTERVAL_MS;
      staleRetries.current = isStale ? staleRetries.current + 1 : 0;
      if (isStale && staleRetries.current <= MAX_STALE_RETRIES) nextDelay = STALE_RETRY_MS;
    } catch (e) {
      setError(friendlyError(e));
      // Sem nada na tela, mostra os últimos dados salvos neste navegador.
      setData((current) => current ?? readLastData());
    } finally {
      setLoading(false);
      setRefreshing(false);
      setStale(false);
      setLastLoadAt(Date.now() - (REFRESH_INTERVAL_MS - nextDelay));
    }
  }, []);

  // Botão "Atualizar agora": fura o cache e busca direto na Meta.
  const refresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  // Atualização automática: usa o cache da CDN, pra várias telas abertas
  // dividirem a mesma consulta à Meta em vez de cada uma fazer a sua.
  const autoRefresh = useCallback(() => {
    setRefreshing(true);
    load(false);
  }, [load]);

  useEffect(() => {
    // Carga inicial: o load só altera estado depois da resposta da API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(false);
  }, [load]);

  // Reagenda o próximo auto-refresh a partir do último carregamento (manual ou
  // automático), assim atualizar ou trocar o período reinicia a contagem.
  useEffect(() => {
    if (lastLoadAt === null) return;
    const delay = Math.max(0, REFRESH_INTERVAL_MS - (Date.now() - lastLoadAt));
    const timeout = setTimeout(autoRefresh, delay);
    return () => clearTimeout(timeout);
  }, [lastLoadAt, autoRefresh]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const applyFilter = (next: FilterState) => {
    filterRef.current = next;
    setFilter(next);
    setStale(true);
    setRefreshing(true);
    load(false);
  };

  const secondsToNextRefresh =
    lastLoadAt === null
      ? null
      : Math.max(0, Math.ceil((lastLoadAt + REFRESH_INTERVAL_MS - now) / 1000));
  const nextRefreshLabel =
    secondsToNextRefresh === null
      ? null
      : `${Math.floor(secondsToNextRefresh / 60)}:${String(secondsToNextRefresh % 60).padStart(2, "0")}`;

  // Abas agrupadas por loja; dentro da loja, sempre na mesma ordem de tipo.
  const campaignTabs = useMemo(
    () =>
      (data?.levels.campaigns ?? [])
        .map((c) => ({ ...c, store: storeOf(c.name), kind: kindOf(c.name) }))
        .sort(
          (a, b) =>
            STORES.indexOf(a.store) - STORES.indexOf(b.store) ||
            KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
        ),
    [data],
  );
  const storeGroups = STORES.map((store) => ({
    store,
    items: campaignTabs.filter((c) => c.store === store),
  })).filter((g) => g.items.length > 0);
  const activeStore = MULTI_STORE
    ? STORES.find((store) => panel === storePanel(store))
    : undefined;
  const activeCampaign = campaignTabs.find((c) => c.id === panel);
  const activeKind = kindOf(activeCampaign?.name ?? "");
  const activeResult = KINDS[activeKind].result;
  const activeUnit = KINDS[activeKind].unit;
  // Cópia antiga salva no navegador tinha outro formato: sem quebra pela campanha, não mostra.
  const breakdowns = activeCampaign ? data?.resultBreakdowns?.[activeCampaign.id] : undefined;

  const periodLabel = data
    ? data.range.since === data.range.until
      ? formatFullDate(data.range.since)
      : `${formatFullDate(data.range.since)} a ${formatFullDate(data.range.until)}`
    : "";
  const headerProps = {
    filter,
    onApplyFilter: applyFilter,
    loading: refreshing,
  };
  const hasData = !!data && data.totals.impressions > 0;
  const whatsappCampaigns = campaignTabs.filter((c) => isLeadKind(c.kind));
  const resumoTotals = data ? withMessages(data.totals, whatsappCampaigns) : null;
  // Série diária de um grupo de produtos: investimento de todos eles, com os
  // leads (e o custo por lead) só dos produtos de captação.
  const dailyFor = (campaigns: typeof campaignTabs) =>
    (data?.dailyChart ?? []).map((day, i) => {
      let spend = 0;
      let conversations = 0;
      let whatsappSpend = 0;
      for (const c of campaigns) {
        const point = data?.dailyByCampaign[c.id]?.[i];
        if (!point) continue;
        spend += point.spend;
        if (isLeadKind(c.kind)) {
          conversations += point.conversations;
          whatsappSpend += point.spend;
        }
      }
      return {
        ...day,
        spend,
        conversations,
        costPerConversation: conversations > 0 ? whatsappSpend / conversations : null,
      };
    });

  // Resumo de uma loja: mesmos cards do Resumo Geral, só com as campanhas dela.
  const storeCampaigns = campaignTabs.filter((c) => c.store === activeStore);
  const storeWhatsapp = storeCampaigns.filter((c) => isLeadKind(c.kind));
  const storeData = activeStore ? data?.stores?.[activeStore] : undefined;
  const storeTotals = withMessages(
    storeData?.totals ?? computeSummary(storeCampaigns, null),
    storeWhatsapp,
  );
  const storePrevious =
    data && storeData
      ? withMessages(
          storeData.previousTotals,
          storeWhatsapp.flatMap((c) => data.previousByCampaign[c.id] ?? []),
        )
      : undefined;

  const sideItem = (key: string, label: string, icon: ReactNode, indent: boolean) => (
    <button
      key={key}
      onClick={() => setPanel(key)}
      title={sidebarCollapsed ? label : undefined}
      className={`mb-1 flex w-full items-center gap-2.5 rounded-lg border py-2 text-left text-[13.5px] font-medium transition-colors ${
        sidebarCollapsed ? "justify-center px-3" : indent ? "pl-5 pr-3" : "px-3"
      } ${
        panel === key
          ? "border-blue-500/50 bg-blue-500/15 text-white"
          : "border-transparent text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      {icon}
      {!sidebarCollapsed && label}
    </button>
  );
  const mobileTab = (key: string, label: string, icon: ReactNode, strong = false) => (
    <button
      key={key}
      onClick={() => {
        setPanel(key);
        window.scrollTo({ top: 0 });
      }}
      className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 font-medium whitespace-nowrap ${
        strong ? "text-[11px] font-bold uppercase tracking-wider" : "text-[13px]"
      } ${
        panel === key
          ? "border-blue-500/50 bg-blue-500/15 text-white"
          : "border-white/10 text-slate-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
  const storeDot = (store: Store, size = "h-2.5 w-2.5") => (
    <span
      className={`inline-block flex-shrink-0 rounded-full ${size}`}
      style={{ background: STORE_COLORS[store] }}
    />
  );
  const resumoPrevious = data
    ? withMessages(
        data.previousTotals,
        whatsappCampaigns.flatMap((c) => data.previousByCampaign[c.id] ?? []),
      )
    : undefined;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 md:flex">
      {/* Celular: barra fixa no topo com a logo e as abas em rolagem horizontal. */}
      <header className="sticky top-0 z-30 bg-[#0f172a] md:hidden">
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/foto-cliente.jpg"
                alt="Silhouette Experts"
                width={160}
                height={160}
                className="h-9 w-9 rounded-full object-cover ring-1 ring-white/20"
              />
              <span className="truncate text-sm font-semibold text-white">Silhouette Experts</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              {data && (
                <>
                  Atualizado às{" "}
                  {new Date(data.updatedAt).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </>
              )}
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 disabled:opacity-60"
          >
            {refreshing && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400/30 border-t-slate-200" />
            )}
            {refreshing ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
        <nav className="flex gap-1.5 overflow-x-auto px-4 py-3">
          {mobileTab(RESUMO_PANEL, "Resumo Geral", <LayoutDashboard size={15} strokeWidth={2} />)}
          {storeGroups.map((group) => (
            <Fragment key={group.store}>
              {MULTI_STORE &&
                mobileTab(storePanel(group.store), group.store, storeDot(group.store), true)}
              {group.items.map((c) => {
                const Icon = KINDS[c.kind].icon;
                return mobileTab(c.id, KINDS[c.kind].tab, <Icon size={15} strokeWidth={2} />);
              })}
            </Fragment>
          ))}
        </nav>
      </header>

      <aside
        className={`sticky top-0 hidden h-screen flex-shrink-0 overflow-y-auto overflow-x-hidden bg-[#0f172a] py-4 transition-all duration-200 md:block ${
          sidebarCollapsed ? "w-[72px]" : "w-[240px]"
        }`}
      >
        <div className="mb-3 border-b border-white/10 px-5 pb-4">
          <div
            className={`flex items-center ${
              sidebarCollapsed ? "justify-center" : "justify-between gap-2"
            }`}
          >
            {!sidebarCollapsed && (
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Dashboard Silhouette Experts
              </div>
            )}
            <button
              onClick={() => setSidebarChoice(!sidebarCollapsed)}
              title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/20 text-slate-300 hover:border-blue-500/50 hover:text-white"
            >
              {sidebarCollapsed ? (
                <ChevronRight size={16} strokeWidth={2} />
              ) : (
                <ChevronLeft size={16} strokeWidth={2} />
              )}
            </button>
          </div>
          {!sidebarCollapsed && (
            <>
              <h1 className="mt-4 flex flex-col items-center gap-2 text-center">
                {/* Foto estática servida de /public; next/image não traz ganho aqui. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/foto-cliente.jpg"
                  alt="Silhouette Experts"
                  width={160}
                  height={160}
                  className="h-20 w-20 rounded-full object-cover ring-2 ring-white/15"
                />
                <span className="text-sm font-semibold leading-tight text-white">
                  Silhouette Experts
                </span>
              </h1>
            </>
          )}
        </div>
        <nav className="px-3">
          {sideItem(
            RESUMO_PANEL,
            "Resumo Geral",
            <LayoutDashboard size={17} strokeWidth={2} />,
            false,
          )}
          {storeGroups.map((group) => {
            const key = storePanel(group.store);
            const closed = closedStores.includes(group.store);
            return (
              <Fragment key={group.store}>
                {!MULTI_STORE ? null : sidebarCollapsed ? (
                  <>
                    <div className="mx-2 my-2 border-t border-white/10" />
                    {sideItem(key, group.store, storeDot(group.store, "h-3 w-3"), false)}
                  </>
                ) : (
                  // Nome da loja abre o resumo dela; a seta esconde ou mostra as campanhas.
                  <div
                    className={`mb-1 mt-3 flex items-center rounded-lg border transition-colors ${
                      panel === key
                        ? "border-blue-500/50 bg-blue-500/15 text-white"
                        : "border-transparent text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <button
                      onClick={() => setPanel(key)}
                      className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-3 text-left text-[11px] font-bold uppercase tracking-wider"
                    >
                      {storeDot(group.store)}
                      <span className="leading-tight">{group.store}</span>
                    </button>
                    <button
                      onClick={() =>
                        setClosedStores((list) =>
                          closed ? list.filter((s) => s !== group.store) : [...list, group.store],
                        )
                      }
                      title={closed ? "Mostrar campanhas" : "Esconder campanhas"}
                      aria-expanded={!closed}
                      className="flex-shrink-0 px-2 py-2 text-slate-400 hover:text-white"
                    >
                      <ChevronDown
                        size={15}
                        className={`transition-transform ${closed ? "-rotate-90" : ""}`}
                      />
                    </button>
                  </div>
                )}
                {(!closed || sidebarCollapsed) &&
                  group.items.map((c) => {
                    const Icon = KINDS[c.kind].icon;
                    return sideItem(
                      c.id,
                      sidebarCollapsed && MULTI_STORE
                        ? `${group.store} · ${KINDS[c.kind].tab}`
                        : KINDS[c.kind].tab,
                      <Icon size={17} strokeWidth={2} />,
                      MULTI_STORE,
                    );
                  })}
              </Fragment>
            );
          })}
        </nav>
        {data && (
          <div className={`mt-6 text-[11px] text-slate-400 ${sidebarCollapsed ? "px-3" : "px-5"}`}>
            {!sidebarCollapsed && (
              <>
                <div>
                  Atualizado em {new Date(data.updatedAt).toLocaleDateString("pt-BR")} às{" "}
                  {new Date(data.updatedAt).toLocaleTimeString("pt-BR")}
                </div>
                {lastRefreshMs !== null && (
                  <div className="mt-0.5">
                    Levou{" "}
                    {(lastRefreshMs / 1000).toLocaleString("pt-BR", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                    s para atualizar
                  </div>
                )}
                {!refreshing && nextRefreshLabel && (
                  <div className="mt-0.5">Próxima atualização em {nextRefreshLabel}</div>
                )}
              </>
            )}
            <button
              onClick={refresh}
              disabled={refreshing}
              title={sidebarCollapsed ? "Atualizar agora" : undefined}
              className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-white/15 bg-white/5 text-center text-xs font-medium text-slate-200 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                sidebarCollapsed ? "px-2 py-2" : "px-3 py-1.5"
              }`}
            >
              {refreshing && (
                <span className="h-3 w-3 flex-shrink-0 animate-spin rounded-full border-2 border-slate-400/30 border-t-slate-200" />
              )}
              {!sidebarCollapsed && (refreshing ? "Atualizando..." : "Atualizar agora")}
              {sidebarCollapsed && !refreshing && "↻"}
            </button>
          </div>
        )}
      </aside>

      <main
        className={`min-w-0 flex-1 px-4 py-6 transition-opacity duration-300 sm:px-8 sm:py-8 ${
          stale && data ? "pointer-events-none opacity-40" : "opacity-100"
        }`}
      >
        {data && !error && now - Date.parse(data.updatedAt) > REFRESH_INTERVAL_MS + 60 * 1000 && (
          <div className="mb-6 flex items-center gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
            <span className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
            <span>
              Mostrando os dados de {new Date(data.updatedAt).toLocaleDateString("pt-BR")} às{" "}
              {new Date(data.updatedAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              . Buscando os mais recentes…
            </span>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            {data && (
              <>
                {" "}
                Mostrando os dados de {new Date(data.updatedAt).toLocaleDateString("pt-BR")} às{" "}
                {new Date(data.updatedAt).toLocaleTimeString("pt-BR")}.
              </>
            )}
          </div>
        )}

        {loading && !data && <div className="text-gray-500">Carregando dados…</div>}

        {data && !activeCampaign && !activeStore && (
          <div>
            <PanelHeader
              title="Resumo Geral"
              description="Visão consolidada das campanhas de captação da Live Secreta, da Promo Diária e do LI 35 no Meta Ads."
              {...headerProps}
            />

            {hasData && resumoTotals ? (
              <>
                <div className="mb-6 rounded-lg border-l-[3px] border-blue-600 bg-blue-50 px-4 py-3.5 text-[13.5px] leading-relaxed text-gray-700">
                  No período de <b className="text-gray-900">{periodLabel}</b>,{" "}
                  <b className="text-gray-900">{formatBRL(data.totals.spend)}</b> investidos
                  alcançaram <b className="text-gray-900">{formatNumber(data.totals.reach)}</b>{" "}
                  pessoas, com{" "}
                  <b className="text-gray-900">{formatNumber(data.totals.impressions)}</b>{" "}
                  impressões. As campanhas de captação (Live Secreta, Promo Diária e LI 35) geraram{" "}
                  <b className="text-gray-900">{formatNumber(resumoTotals.conversations)}</b>{" "}
                  leads, a{" "}
                  <b className="text-gray-900">{formatBRL(resumoTotals.costPerConversation)}</b> por
                  lead (considerando só o investimento dessas campanhas).
                </div>

                <KpiGrid
                  kind={LEAD_KIND}
                  totals={resumoTotals}
                  previous={resumoPrevious}
                  previousRange={data.previousRange}
                />

                <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
                  <DonutChart
                    title={MULTI_STORE ? "Investimento por Loja" : "Investimento por Campanha"}
                    description={`Como o valor investido no período se divide entre as ${MULTI_STORE ? "lojas" : "campanhas"}.`}
                    data={sliceByStore(data.levels.campaigns, (c) => c.spend)}
                    centerLabel="investidos"
                    format={formatBRL}
                  />
                  <DonutChart
                    title={MULTI_STORE ? "Impressões por Loja" : "Impressões por Campanha"}
                    description={`Como as impressões do período se dividem entre as ${MULTI_STORE ? "lojas" : "campanhas"}.`}
                    data={sliceByStore(data.levels.campaigns, (c) => c.impressions)}
                    centerLabel="impressões"
                    format={formatNumber}
                  />
                </div>
                <LevelTable
                  title="Todas as campanhas"
                  totalReach={data.totals.reach}
                  rows={data.levels.campaigns}
                  nameLabel="Campanha"
                  formatName={campaignLabel}
                  dotColor={(name) => (MULTI_STORE ? STORE_COLORS[storeOf(name)] : KIND_COLORS[kindOf(name)])}
                />
              </>
            ) : (
              <EmptyState />
            )}
          </div>
        )}

        {data && activeStore && (
          <div>
            <PanelHeader
              title={activeStore}
              description="Visão consolidada das campanhas da loja no Meta Ads."
              {...headerProps}
            />
            {storeTotals.impressions > 0 ? (
              <>
                <KpiGrid
                  kind={LEAD_KIND}
                  totals={storeTotals}
                  previous={storePrevious}
                  previousRange={data.previousRange}
                />
                <InvestimentoConversasChart
                  kind={LEAD_KIND}
                  data={dailyFor(storeCampaigns)}
                  note="(acumulado do dia entre as campanhas da loja)"
                />
                <LevelTable
                  title="Campanhas da loja"
                  totalReach={storeTotals.reach}
                  rows={storeCampaigns}
                  nameLabel="Campanha"
                  formatName={(name) => KINDS[kindOf(name)].tab}
                />
              </>
            ) : (
              <EmptyState />
            )}
          </div>
        )}

        {data && activeCampaign && (
          <div>
            <PanelHeader
              title={campaignLabel(activeCampaign.name)}
              description={KINDS[activeKind].description}
              {...headerProps}
            />
            {activeKind === "li35" && (
              <SectionTitle
                icon={<MetaLogo />}
                note="Campanhas de captação do LI 35 no Facebook e no Instagram."
              >
                Meta Ads
              </SectionTitle>
            )}
            <KpiGrid
              kind={activeKind}
              totals={activeCampaign}
              previous={data.previousByCampaign[activeCampaign.id]}
              previousRange={data.previousRange}
            />
            <InvestimentoConversasChart
              kind={activeKind}
              data={data.dailyByCampaign[activeCampaign.id] ?? []}
            />
            <MetricasChart kind={activeKind} data={data.dailyByCampaign[activeCampaign.id] ?? []} />
            <LevelTable
              kind={activeKind}
              title="Campanhas"
              totalReach={activeCampaign.reach}
              rows={(data.levels.realCampaigns ?? []).filter(
                (r) => r.campaignId === activeCampaign.id,
              )}
              nameLabel="Campanha"
            />
            <LevelTable
              kind={activeKind}
              title="Conjuntos de anúncios"
              totalReach={activeCampaign.reach}
              rows={data.levels.adsets.filter((r) => r.campaignId === activeCampaign.id)}
              nameLabel="Conjunto"
            />
            <LevelTable
              kind={activeKind}
              title="Anúncios"
              totalReach={activeCampaign.reach}
              rows={data.levels.ads.filter((r) => r.campaignId === activeCampaign.id)}
              nameLabel="Anúncio"
              searchable
              showPreviewLink
            />
            {breakdowns?.age && breakdowns.age.length > 0 && activeCampaign.conversations > 0 && (
              <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
                <DonutChart
                  title={`${activeResult} por Idade`}
                  description={`Faixa de idade das pessoas que geraram ${activeUnit}.`}
                  data={breakdowns.age}
                  centerLabel={activeUnit}
                  format={formatNumber}
                />
                <DonutChart
                  title={`${activeResult} por Gênero`}
                  description={`Como ${KINDS[activeKind].article} ${activeUnit} do período se dividem entre mulheres e homens.`}
                  data={breakdowns.gender}
                  centerLabel={activeUnit}
                  format={formatNumber}
                />
                <DonutChart
                  title={`${activeResult} por Posicionamento`}
                  description="Em que lugar do Instagram ou do Facebook o anúncio apareceu antes do resultado."
                  data={breakdowns.placement}
                  centerLabel={activeUnit}
                  format={formatNumber}
                />
                <DonutChart
                  title={`${activeResult} por Dispositivo`}
                  description="Sistema do aparelho de quem viu o anúncio: Android ou iOS (iPhone)."
                  data={breakdowns.device}
                  centerLabel={activeUnit}
                  format={formatNumber}
                />
              </div>
            )}
            {activeKind === "li35" && (
              <GoogleAdsSection range={data.range} refreshKey={data.updatedAt} meta={activeCampaign} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

type GoogleData = {
  range: DateRange;
  previousRange: DateRange;
  totals: Metrics;
  previousTotals: Metrics;
  levels: { campaigns: Row[]; adsets: Row[]; ads: Row[] };
  dailyChart: DailyPoint[];
};

// O Google Ads não informa alcance nem a visita à página de captura.
const GOOGLE_HIDDEN_COLUMNS: SortKey[] = ["reach", "frequency", "loadRate", "pageConversionRate"];

// Logos de marca em SVG próprio: o lucide-react não tem ícones de marca.
function MetaLogo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#0081FB" aria-hidden="true">
      <path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z" />
    </svg>
  );
}

function GoogleAdsLogo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <line x1="10.9" y1="5.6" x2="5" y2="16.2" stroke="#FBBC04" strokeWidth="6.4" strokeLinecap="round" />
      <line x1="13" y1="5.6" x2="19" y2="16.2" stroke="#4285F4" strokeWidth="6.4" strokeLinecap="round" />
      <circle cx="5" cy="16.2" r="3.2" fill="#34A853" />
    </svg>
  );
}

function SectionTitle({
  children,
  note,
  icon,
}: {
  children: ReactNode;
  note?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-4 mt-10 border-b border-gray-200 pb-2">
      <h2 className="flex items-center gap-2.5 text-lg font-bold text-gray-900">
        {icon}
        {children}
      </h2>
      {note && <p className="mt-0.5 text-sm text-gray-500">{note}</p>}
    </div>
  );
}

// Parte do Google Ads da aba de captação. Segue o mesmo período da parte da
// Meta e busca de novo sempre que o dashboard é atualizado (`refreshKey`).
function GoogleAdsSection({
  range,
  refreshKey,
  meta,
}: {
  range: DateRange;
  refreshKey: string;
  meta: Metrics;
}) {
  const key = `${range.since}:${range.until}:${refreshKey}`;
  const [result, setResult] = useState<{ key: string; data?: GoogleData; error?: string }>();

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ since: range.since, until: range.until });
    fetch(`/api/google?${params}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || "Erro ao buscar o Google Ads.");
        if (!cancelled) setResult({ key, data: json as GoogleData });
      })
      .catch((e) => {
        if (!cancelled) setResult({ key, error: friendlyError(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [key, range.since, range.until]);

  const fresh = result?.key === key ? result : undefined;
  const data = fresh?.data ?? result?.data;
  const loading = !fresh && !!data;
  const error = fresh?.error;

  type Card = {
    label: string;
    trend: Trend;
    get: (m: Metrics) => number | null;
    format: (v: number | null) => string;
  };
  const cards: Card[] = [
    { label: "Valor Investido", trend: "up", get: (m) => m.spend, format: formatBRL },
    { label: "Leads", trend: "up", get: (m) => m.conversations, format: formatNumber },
    { label: "Custo por Lead", trend: "down", get: (m) => m.costPerConversation, format: formatBRL },
    { label: "Impressões", trend: "up", get: (m) => m.impressions, format: formatNumber },
    { label: "Cliques", trend: "up", get: (m) => m.linkClicks, format: formatNumber },
    { label: "CTR", trend: "up", get: (m) => m.ctrLink, format: formatRate },
    { label: "CPC", trend: "down", get: (m) => m.cpcLink, format: formatBRL },
  ];
  const renderCard = (card: Card, index: number, list: Card[]) => {
    const current = data ? card.get(data.totals) : null;
    const previous = data ? card.get(data.previousTotals) : null;
    return (
      <Kpi
        key={card.label}
        label={card.label}
        value={card.format(current)}
        current={current}
        previous={previous}
        previousLabel={card.format(previous)}
        trend={card.trend}
        className={list.length % 2 === 1 && index === 0 ? "col-span-2 sm:col-span-1" : ""}
      />
    );
  };

  const platforms: { name: string; m: Metrics }[] = data
    ? [
        { name: "Meta Ads", m: meta },
        { name: "Google Ads", m: data.totals },
      ]
    : [];
  const sum = (get: (m: Metrics) => number) => platforms.reduce((s, p) => s + get(p.m), 0);
  const totalSpend = sum((m) => m.spend);
  const totalLeads = sum((m) => m.conversations);
  const totalImpressions = sum((m) => m.impressions);
  const totalClicks = sum((m) => m.linkClicks);
  const platformRows = [
    ...platforms.map((p) => ({
      name: p.name,
      spend: p.m.spend,
      leads: p.m.conversations,
      cost: p.m.costPerConversation,
      impressions: p.m.impressions,
      clicks: p.m.linkClicks,
      ctr: p.m.ctrLink,
    })),
    {
      name: "Total",
      spend: totalSpend,
      leads: totalLeads,
      cost: totalLeads > 0 ? totalSpend / totalLeads : null,
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null,
    },
  ];

  return (
    <div>
      <SectionTitle
        icon={<GoogleAdsLogo />}
        note="Campanhas de captação do LI 35 no Google Ads. Leads são as conversões registradas pelo Google."
      >
        Google Ads
      </SectionTitle>
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {!data && !error && <div className="text-gray-500">Carregando dados do Google Ads…</div>}
      {data && (
        <div className={`transition-opacity duration-300 ${loading ? "opacity-40" : ""}`}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {cards.slice(0, 3).map(renderCard)}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {cards.slice(3).map(renderCard)}
            </div>
            <p className="text-xs text-gray-500">
              Variação em relação ao período anterior ({formatFullDate(data.previousRange.since)} a{" "}
              {formatFullDate(data.previousRange.until)}).
            </p>
          </div>
          {data.totals.impressions > 0 ? (
            <>
              <InvestimentoConversasChart kind="li35" data={data.dailyChart} />
              <LevelTable
                kind="li35"
                title="Campanhas"
                totalReach={null}
                rows={data.levels.campaigns}
                nameLabel="Campanha"
                hideColumns={GOOGLE_HIDDEN_COLUMNS}
              />
              <LevelTable
                kind="li35"
                title="Grupos de anúncios"
                totalReach={null}
                rows={data.levels.adsets}
                nameLabel="Grupo"
                hideColumns={GOOGLE_HIDDEN_COLUMNS}
              />
              <LevelTable
                kind="li35"
                title="Anúncios"
                totalReach={null}
                rows={data.levels.ads}
                nameLabel="Anúncio"
                searchable
                showPreviewLink
                hideColumns={GOOGLE_HIDDEN_COLUMNS}
              />
            </>
          ) : (
            <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600 shadow-sm">
              As campanhas de captação do Google Ads ainda não tiveram veiculação neste período.
              {data.levels.campaigns.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {data.levels.campaigns.map((c) => (
                    <li key={c.id}>
                      {c.name} <span className="text-gray-400">({c.status})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <SectionTitle note="Soma das duas plataformas no período. O custo por lead do total é o investimento somado dividido pelos leads somados.">
            Meta Ads + Google Ads
          </SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <table className="w-full text-sm" style={{ minWidth: 640 }}>
              <thead>
                <tr className="border-b border-gray-200 text-xs tracking-wide text-gray-500">
                  <th className="px-2.5 py-2.5 text-left">Plataforma</th>
                  <th className="px-2.5 py-2.5 text-center">Valor Investido</th>
                  <th className="px-2.5 py-2.5 text-center">Leads</th>
                  <th className="px-2.5 py-2.5 text-center">Custo por Lead</th>
                  <th className="px-2.5 py-2.5 text-center">Impressões</th>
                  <th className="px-2.5 py-2.5 text-center">Cliques</th>
                  <th className="px-2.5 py-2.5 text-center">CTR</th>
                </tr>
              </thead>
              <tbody>
                {platformRows.map((row) => (
                  <tr
                    key={row.name}
                    className={`border-b border-gray-100 ${row.name === "Total" ? "bg-gray-50 font-semibold" : ""}`}
                  >
                    <td className="px-2.5 py-2.5 text-left text-gray-900">{row.name}</td>
                    <td className="px-2.5 py-2.5 text-center">{formatBRL(row.spend)}</td>
                    <td className="px-2.5 py-2.5 text-center">{formatNumber(row.leads)}</td>
                    <td className="px-2.5 py-2.5 text-center">{formatBRL(row.cost)}</td>
                    <td className="px-2.5 py-2.5 text-center">{formatNumber(row.impressions)}</td>
                    <td className="px-2.5 py-2.5 text-center">{formatNumber(row.clicks)}</td>
                    <td className="px-2.5 py-2.5 text-center">{formatRate(row.ctr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
      Nenhuma campanha teve veiculação no período selecionado. Escolha outro período no filtro
      acima.
    </div>
  );
}
