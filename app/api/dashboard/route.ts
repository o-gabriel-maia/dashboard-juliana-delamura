import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type MetaAction = { action_type: string; value: string };
type MetaResult = { indicator?: string; values?: { value: string }[] };

type MetaAdRow = {
  ad_id: string;
  ad_name: string;
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  campaign_name: string;
  spend: string;
  impressions?: string;
  reach?: string;
  actions?: MetaAction[];
  results?: MetaResult[];
  video_p25_watched_actions?: MetaAction[];
  video_p50_watched_actions?: MetaAction[];
  video_p75_watched_actions?: MetaAction[];
  video_p100_watched_actions?: MetaAction[];
  instagram_profile_visits?: string;
};

type MetaAgg = {
  spend: number;
  conversations: number;
  firstReplies: number;
  impressions: number;
  reach: number;
  linkClicks: number;
  landingPageViews: number;
  // Só campanhas que levam a uma página: cliques e leads usados nas taxas da página.
  pageClicks: number;
  pageConversions: number;
  video3SecViews: number;
  // Reproduções que chegaram a 25%, 50%, 75% e 100% do vídeo (imagem fica em zero).
  videoP25: number;
  videoP50: number;
  videoP75: number;
  videoP100: number;
};

type DashboardRow = {
  id: string;
  campaignId: string;
  name: string;
  parent?: string;
  // Número da live (ex.: LS205_Q), lido do nome da campanha; só nas abas de Live Secreta.
  live?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  status?: string;
  spend: number;
  conversations: number;
  costPerConversation: number | null;
  firstReplies: number;
  replyRate: number | null;
  impressions: number;
  reach: number;
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
  videoP25: number;
  videoP50: number;
  videoP75: number;
  videoP100: number;
};

type EntityInfo = { status?: string; previewUrl?: string; thumbnailUrl?: string; imageUrl?: string };

type DateRange = { since: string; until: string };

// Cada aba do dashboard é uma frente de captação, e as campanhas entram nela
// pelo nome: todas as tags da aba precisam aparecer. Campanha nova entra
// sozinha. O "resultado" (campo `conversations`) é o que a Meta mostra na
// coluna Resultados do Gerenciador: leads (formulário nativo ou pixel). A parte
// do Google Ads do LI35 vem de /api/google.
type GroupKey = "lsq" | "lsd" | "promo" | "li35";
const AD_ACCOUNT_ID = "519177155682126"; // Silhouette Experts
// `search` são os trechos pedidos à Meta; `prefix`, quando existe, confere o
// começo do nome no lugar das tags.
// `names` são nomes exatos (em maiúsculas) de campanhas fora do padrão da tag.
const GROUPS: {
  key: GroupKey;
  name: string;
  tags: string[];
  search?: string[];
  prefix?: RegExp;
  names?: string[];
}[] = [
  // Live Secreta: o código no começo do nome diz o dia, Q = quarta e D = domingo
  // (ex.: [LS203_Q...] e [LS204_D...]).
  { key: "lsq", name: "Live Secreta Quarta", tags: ["LIVE_SECRETA"], prefix: /^\[LS\d+_Q/ },
  { key: "lsd", name: "Live Secreta Domingo", tags: ["LIVE_SECRETA"], prefix: /^\[LS\d+_D/ },
  {
    key: "promo",
    name: "Captação Promo Diária",
    tags: ["PROMO_DIARIA"],
    search: ["PROMO_DIARIA", "Promo Diária"],
    names: ["[LOJA] [FORM] PROMO DIÁRIA"],
  },
  { key: "li35", name: "Captação LI35", tags: ["[LI35]"] },
];
type CampaignInfo = { id: string; name: string; effective_status?: string };
// `campaigns` liga cada campanha ao produto dela; `stores` lista as campanhas de
// cada produto. Os dois são montados a cada carga, a partir dos nomes.
type Account = {
  id: string;
  campaigns: Record<string, GroupKey>;
  // Campanhas de formulário nativo: não levam a uma página, então ficam sem
  // visualização de página e sem as taxas da página.
  formCampaigns: Record<string, true>;
  stores: Record<GroupKey, string[]>;
  list: CampaignInfo[];
};
const RESULT_FIELDS = "actions,results";
// Pixel (evento personalizado, cadastro ou lead) vem em `results`; a Meta usa
// "actions:" ou "conversions:" conforme o objetivo do conjunto.
const LEAD_INDICATOR =
  /^(actions|conversions):(offsite_conversion\.(custom\.|fb_pixel_(custom\.|lead|complete_registration))|lead$|onsite_conversion\.lead)/;
// Formulário nativo: `results` vem vazio e os leads estão nesta ação.
const ACTION_FORM_LEAD = "onsite_conversion.lead_grouped";
const GRAPH_URL = "https://graph.facebook.com/v21.0";
const DEFAULT_RANGE_DAYS = 7;
const MAX_RANGE_DAYS = 370;

const ACTION_FIRST_REPLY = "onsite_conversion.messaging_first_reply";

const EMPTY_META_AGG: MetaAgg = {
  spend: 0,
  conversations: 0,
  firstReplies: 0,
  impressions: 0,
  reach: 0,
  linkClicks: 0,
  landingPageViews: 0,
  pageClicks: 0,
  pageConversions: 0,
  video3SecViews: 0,
  videoP25: 0,
  videoP50: 0,
  videoP75: 0,
  videoP100: 0,
};

function findAction(actions: MetaAction[] | undefined, type: string) {
  const found = actions?.find((a) => a.action_type === type);
  return found ? parseInt(found.value, 10) : 0;
}

type InsightRow = {
  campaign_id?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  actions?: MetaAction[];
  results?: MetaResult[];
  instagram_profile_visits?: string;
  video_p25_watched_actions?: MetaAction[];
  video_p50_watched_actions?: MetaAction[];
  video_p75_watched_actions?: MetaAction[];
  video_p100_watched_actions?: MetaAction[];
};

// Resultado principal da linha: leads. `page` é a parte que veio do pixel (página
// de captura); o resto vem do formulário nativo, que não passa por página.
// Linha sem campanha (total da conta) não tem resultado.
function resultOf(row: InsightRow, group: GroupKey | undefined) {
  if (!group) return { total: 0, page: 0 };
  let page = 0;
  for (const result of row.results ?? []) {
    if (!LEAD_INDICATOR.test(result.indicator ?? "")) continue;
    for (const v of result.values ?? []) page += parseFloat(v.value) || 0;
  }
  return { total: page > 0 ? page : findAction(row.actions, ACTION_FORM_LEAD), page };
}

function toAgg(row: InsightRow, group?: GroupKey, isForm = false): MetaAgg {
  const result = resultOf(row, group);
  // Formulário nativo não passa por página: a Meta ainda registra algumas
  // visualizações, que não valem para as taxas da página.
  const landingPageViews = isForm ? 0 : findAction(row.actions, "landing_page_view");
  const linkClicks = findAction(row.actions, "link_click");
  const isPage = !isForm && (landingPageViews > 0 || result.page > 0);
  return {
    spend: parseFloat(row.spend || "0"),
    conversations: result.total,
    firstReplies: findAction(row.actions, ACTION_FIRST_REPLY),
    impressions: parseFloat(row.impressions || "0"),
    reach: parseFloat(row.reach || "0"),
    linkClicks,
    landingPageViews,
    pageClicks: isPage ? linkClicks : 0,
    pageConversions: isForm ? 0 : result.page,
    video3SecViews: findAction(row.actions, "video_view"),
    videoP25: findAction(row.video_p25_watched_actions, "video_view"),
    videoP50: findAction(row.video_p50_watched_actions, "video_view"),
    videoP75: findAction(row.video_p75_watched_actions, "video_view"),
    videoP100: findAction(row.video_p100_watched_actions, "video_view"),
  };
}

// Data de hoje no fuso de Brasília, pra bater com o dia do Gerenciador.
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

// A Meta às vezes responde com erro passageiro (limite de chamadas, instabilidade
// ou "tente de novo"): repete até 3 vezes, com espera crescente, antes de falhar.
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80014]);
async function fetchMetaPage(url: string) {
  let lastError = "Erro desconhecido";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
    let json: { data?: unknown[]; paging?: { next?: string }; error?: { message?: string; code?: number; is_transient?: boolean } };
    try {
      const res = await fetch(url, { cache: "no-store" });
      json = await res.json();
      if (!res.ok && !json.error) {
        lastError = `A Meta respondeu com erro ${res.status}.`;
        if (res.status >= 500) continue;
        break;
      }
    } catch {
      lastError = "Não foi possível falar com a Meta.";
      continue;
    }
    if (!json.error) return json;
    lastError = `Erro na API da Meta: ${json.error.message}`;
    const transient = json.error.is_transient || TRANSIENT_CODES.has(json.error.code ?? -1);
    if (!transient) break;
  }
  throw new Error(lastError);
}

async function metaGet<T>(
  account: Account,
  path: string,
  params: Record<string, string>
): Promise<T[]> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Credencial da Meta não configurada (META_ACCESS_TOKEN).");
  }

  const query = new URLSearchParams({ ...params, access_token: token });
  let url: string | undefined = `${GRAPH_URL}/act_${account.id}/${path}?${query.toString()}`;
  const rows: T[] = [];

  while (url) {
    const json = await fetchMetaPage(url);
    rows.push(...((json.data || []) as T[]));
    url = json.paging?.next;
  }
  return rows;
}

function campaignFilter(account: Account) {
  return JSON.stringify([
    { field: "campaign.id", operator: "IN", value: Object.keys(account.campaigns) },
  ]);
}

async function fetchMetaAdLevel(account: Account, range: DateRange) {
  const rows = await metaGet<MetaAdRow>(account, "insights", {
    level: "ad",
    fields:
      `ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,reach,${RESULT_FIELDS},video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions`,
    filtering: campaignFilter(account),
    time_range: JSON.stringify(range),
    limit: "500",
  });
  // A Meta devolve linha zerada para anúncio sem veiculação no período.
  return rows.filter((r) => parseFloat(r.spend || "0") > 0 || parseFloat(r.impressions || "0") > 0);
}

// Alcance não pode ser somado entre anúncios (a mesma pessoa vê vários), então o
// alcance de conta, campanha e conjunto vem de consultas próprias em cada nível.
async function fetchAccountTotals(account: Account, range: DateRange) {
  const rows = await metaGet<InsightRow>(account, "insights", {
    level: "account",
    fields: "spend,impressions,reach,actions",
    filtering: campaignFilter(account),
    time_range: JSON.stringify(range),
  });
  return rows[0] ? toAgg(rows[0]) : { ...EMPTY_META_AGG };
}

async function fetchReach(account: Account, level: "campaign" | "adset", range: DateRange) {
  const idField = level === "campaign" ? "campaign_id" : "adset_id";
  const rows = await metaGet<{ campaign_id?: string; adset_id?: string; reach?: string }>(
    account,
    "insights",
    {
      level,
      fields: `${idField},reach`,
      filtering: campaignFilter(account),
      time_range: JSON.stringify(range),
      limit: "500",
    }
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    const id = row[idField];
    if (id) map.set(id, parseFloat(row.reach || "0"));
  }
  return map;
}

// Totais por campanha no período de comparação (só o agregado, sem conjuntos e
// anúncios, pra não dobrar o número de consultas à Meta).
async function fetchCampaignTotals(account: Account, range: DateRange) {
  const rows = await metaGet<InsightRow & { campaign_id: string }>(account, "insights", {
    level: "campaign",
    fields: `campaign_id,spend,impressions,reach,${RESULT_FIELDS}`,
    filtering: campaignFilter(account),
    time_range: JSON.stringify(range),
    limit: "500",
  });
  const map = new Map<string, MetaAgg>();
  for (const row of rows) map.set(row.campaign_id, toAgg(row, account.campaigns[row.campaign_id], !!account.formCampaigns[row.campaign_id]));
  return map;
}

// Período imediatamente anterior, com a mesma duração do período selecionado.
function previousRange(range: DateRange): DateRange {
  const days =
    Math.round(
      (Date.parse(`${range.until}T00:00:00Z`) - Date.parse(`${range.since}T00:00:00Z`)) / 86400000
    ) + 1;
  const until = addDays(range.since, -1);
  return { since: addDays(until, -(days - 1)), until };
}

type Slice = { label: string; value: number };

const GENDER_LABELS: Record<string, string> = {
  female: "Mulheres",
  male: "Homens",
  unknown: "Não informado",
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  messenger: "Messenger",
  audience_network: "Audience Network",
  threads: "Threads",
};

const POSITION_LABELS: Record<string, string> = {
  feed: "Feed",
  instagram_stories: "Stories",
  facebook_stories: "Stories",
  instagram_reels: "Reels",
  facebook_reels: "Reels",
  instagram_explore: "Explorar",
  instagram_explore_grid_home: "Explorar (início)",
  instagram_profile_feed: "Feed do perfil",
  instagram_profile_reels: "Reels do perfil",
  instagram_search: "Busca",
  marketplace: "Marketplace",
  video_feeds: "Feeds de vídeo",
  search: "Busca",
  instream_video: "Vídeos in-stream",
  right_hand_column: "Coluna da direita",
  threads_feed: "Feed",
};

function deviceLabel(device: string) {
  if (/^(iphone|ipad|ipod)$/.test(device)) return "iOS";
  if (device.startsWith("android")) return "Android";
  if (device === "desktop") return "Computador";
  return "Outros";
}

// Resultados (leads ou compras) de um produto divididos por uma quebra da Meta
// (idade, gênero, posicionamento ou dispositivo). É informação de apoio: se a
// consulta falhar, os gráficos ficam vazios e o resto do dashboard continua.
async function fetchBreakdown(
  account: Account,
  group: GroupKey,
  range: DateRange,
  breakdowns: string,
  labelOf: (row: Record<string, string>) => string,
  sortByLabel = false,
  campaignIds?: string[]
): Promise<Slice[]> {
  try {
    type Row = Record<string, string> & { results?: MetaResult[] };
    const rows = await metaGet<Row>(account, "insights", {
      level: "campaign",
      fields: "campaign_id,results,actions",
      breakdowns,
      filtering: JSON.stringify([
        { field: "campaign.id", operator: "IN", value: campaignIds ?? account.stores[group] },
      ]),
      time_range: JSON.stringify(range),
      limit: "500",
    });
    const totals = new Map<string, number>();
    for (const row of rows) {
      const value = resultOf(row, group).total;
      if (value <= 0) continue;
      const label = labelOf(row);
      totals.set(label, (totals.get(label) ?? 0) + value);
    }
    const slices = [...totals].map(([label, value]) => ({ label, value }));
    slices.sort((a, b) =>
      sortByLabel ? a.label.localeCompare(b.label, "pt-BR") : b.value - a.value
    );
    // A rosca tem 7 cores: do 7º item em diante vira "Outros".
    if (slices.length <= 7) return slices;
    const rest = slices.slice(6).reduce((sum, s) => sum + s.value, 0);
    return [...slices.slice(0, 6), { label: "Outros", value: rest }];
  } catch {
    return [];
  }
}

async function fetchBreakdowns(
  account: Account,
  group: GroupKey,
  range: DateRange,
  campaignIds?: string[]
) {
  const empty = { age: [], gender: [], placement: [], device: [] } as Record<string, Slice[]>;
  if ((campaignIds ?? account.stores[group]).length === 0) return [group, empty] as const;
  const [age, gender, placement, device] = await Promise.all([
    fetchBreakdown(
      account,
      group,
      range,
      "age",
      (r) => (/^\d/.test(r.age) ? `${r.age} anos` : "Não informado"),
      true,
      campaignIds
    ),
    fetchBreakdown(
      account,
      group,
      range,
      "gender",
      (r) => GENDER_LABELS[r.gender] ?? r.gender,
      false,
      campaignIds
    ),
    fetchBreakdown(
      account,
      group,
      range,
      "publisher_platform,platform_position",
      (r) =>
        [
          POSITION_LABELS[r.platform_position] ?? r.platform_position,
          PLATFORM_LABELS[r.publisher_platform] ?? r.publisher_platform,
        ].join(" · "),
      false,
      campaignIds
    ),
    fetchBreakdown(
      account,
      group,
      range,
      "impression_device",
      (r) => deviceLabel(r.impression_device),
      false,
      campaignIds
    ),
  ]);
  return [group, { age, gender, placement, device }] as const;
}

// Tudo o que vem de uma conta de anúncios. Status e prévia dependem dos IDs que
// tiveram veiculação, por isso são buscados depois dos insights.
async function loadAccount(account: Account, range: DateRange, previous: DateRange) {
  const [
    metaAds,
    totals,
    daily,
    campaignReach,
    adsetReach,
    previousTotals,
    previousCampaignTotals,
  ] = await Promise.all([
    fetchMetaAdLevel(account, range),
    fetchAccountTotals(account, range),
    fetchDailySeries(account, range),
    fetchReach(account, "campaign", range),
    fetchReach(account, "adset", range),
    fetchAccountTotals(account, previous),
    fetchCampaignTotals(account, previous),
  ]);
  const [adsetEntities, adEntities] = await Promise.all([
    fetchEntities(account, "adsets", [...new Set(metaAds.map((r) => r.adset_id))]),
    fetchEntities(account, "ads", [...new Set(metaAds.map((r) => r.ad_id))]),
  ]);
  return {
    metaAds,
    totals,
    daily,
    campaignReach,
    adsetReach,
    previousTotals,
    previousCampaignTotals,
    adsetEntities,
    adEntities,
  };
}

// Alcance de um produto no período e no período anterior. Vem de consulta
// própria porque não é a soma do alcance das campanhas dele.
async function fetchGroupReach(
  account: Account,
  group: GroupKey,
  range: DateRange,
  previous: DateRange
) {
  const ids = account.stores[group];
  const fetchReachOf = async (r: DateRange) => {
    if (ids.length === 0) return 0;
    const rows = await metaGet<InsightRow>(account, "insights", {
      level: "account",
      fields: "reach",
      filtering: JSON.stringify([{ field: "campaign.id", operator: "IN", value: ids }]),
      time_range: JSON.stringify(r),
    });
    return parseFloat(rows[0]?.reach || "0");
  };
  const [reach, previousReach] = await Promise.all([fetchReachOf(range), fetchReachOf(previous)]);
  return [group, { reach, previousReach }] as const;
}

function sumAgg(a: MetaAgg, b: MetaAgg): MetaAgg {
  return {
    spend: a.spend + b.spend,
    conversations: a.conversations + b.conversations,
    firstReplies: a.firstReplies + b.firstReplies,
    impressions: a.impressions + b.impressions,
    reach: a.reach + b.reach,
    linkClicks: a.linkClicks + b.linkClicks,
    landingPageViews: a.landingPageViews + b.landingPageViews,
    pageClicks: a.pageClicks + b.pageClicks,
    pageConversions: a.pageConversions + b.pageConversions,
    video3SecViews: a.video3SecViews + b.video3SecViews,
    videoP25: a.videoP25 + b.videoP25,
    videoP50: a.videoP50 + b.videoP50,
    videoP75: a.videoP75 + b.videoP75,
    videoP100: a.videoP100 + b.videoP100,
  };
}

// Preenche todos os dias do período (mesmo sem dado) pra não quebrar o eixo X
// do gráfico nem pular linhas na tabela diária.
function buildDailyPoints(byDate: Map<string, MetaAgg> | undefined, range: DateRange) {
  const days = [];
  for (let date = range.since; date <= range.until; date = addDays(date, 1)) {
    const d = byDate?.get(date) ?? EMPTY_META_AGG;
    days.push({
      date,
      spend: d.spend,
      conversations: d.conversations,
      costPerConversation: d.conversations > 0 ? d.spend / d.conversations : null,
      impressions: d.impressions,
      cpm: d.impressions > 0 ? (d.spend / d.impressions) * 1000 : null,
      ctrLink: d.impressions > 0 ? (d.linkClicks / d.impressions) * 100 : null,
      cpcLink: d.linkClicks > 0 ? d.spend / d.linkClicks : null,
      conversationRate: d.linkClicks > 0 ? (d.conversations / d.linkClicks) * 100 : null,
    });
  }
  return days;
}

async function fetchDailySeries(account: Account, range: DateRange) {
  const rows = await metaGet<InsightRow & { campaign_id: string; date_start: string }>(account, "insights", {
    level: "campaign",
    fields: `campaign_id,spend,impressions,${RESULT_FIELDS}`,
    filtering: campaignFilter(account),
    time_range: JSON.stringify(range),
    time_increment: "1",
    limit: "500",
  });

  const total = new Map<string, MetaAgg>();
  const byCampaign = new Map<string, Map<string, MetaAgg>>();
  for (const row of rows) {
    const agg = toAgg(row, account.campaigns[row.campaign_id], !!account.formCampaigns[row.campaign_id]);
    total.set(row.date_start, sumAgg(total.get(row.date_start) ?? EMPTY_META_AGG, agg));
    const campaignDays = byCampaign.get(row.campaign_id) ?? new Map<string, MetaAgg>();
    campaignDays.set(row.date_start, agg);
    byCampaign.set(row.campaign_id, campaignDays);
  }
  return { total, byCampaign };
}

// Descobre as campanhas de cada produto pela tag no nome. A Meta filtra pelo
// primeiro trecho e o código confere se todas as tags do produto aparecem.
async function resolveAccount(): Promise<Account> {
  const account: Account = {
    id: AD_ACCOUNT_ID,
    campaigns: {},
    formCampaigns: {},
    stores: { lsq: [], lsd: [], promo: [], li35: [] },
    list: [],
  };
  const searchOf = (group: (typeof GROUPS)[number]) =>
    group.search ?? [group.tags[0].replace(/[[\]]/g, "")];
  const found = await Promise.all(
    GROUPS.map(async (group) => {
      const lists = await Promise.all(
        searchOf(group).map((value) =>
          metaGet<CampaignInfo>(account, "campaigns", {
            fields: "id,name,effective_status",
            filtering: JSON.stringify([{ field: "name", operator: "CONTAIN", value }]),
            limit: "500",
          })
        )
      );
      return lists.flat();
    })
  );
  GROUPS.forEach((group, i) => {
    for (const campaign of found[i]) {
      const name = campaign.name.toUpperCase();
      const matches = group.prefix
        ? group.prefix.test(name)
        : group.tags.every((tag) => name.includes(tag)) || !!group.names?.includes(name);
      if (!matches || account.campaigns[campaign.id]) continue;
      if (/FORM_NATIVO|\[FORM\]/.test(name)) account.formCampaigns[campaign.id] = true;
      account.campaigns[campaign.id] = group.key;
      account.stores[group.key].push(campaign.id);
      account.list.push(campaign);
    }
  });
  return account;
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  PAUSED: "Pausado",
  CAMPAIGN_PAUSED: "Pausado (campanha)",
  ADSET_PAUSED: "Pausado (conjunto)",
  ARCHIVED: "Arquivado",
  DELETED: "Excluído",
  PENDING_REVIEW: "Em análise",
  DISAPPROVED: "Reprovado",
  PREAPPROVED: "Pré-aprovado",
  PENDING_BILLING_INFO: "Pendente (cobrança)",
  WITH_ISSUES: "Com problemas",
  IN_PROCESS: "Em processamento",
};

function translateStatus(status: string | undefined) {
  if (!status) return undefined;
  return STATUS_LABELS[status] || status;
}

// Status e prévia são buscados só dos IDs que têm insight no período, em vez de
// escanear a conta inteira (bem mais lento).
async function fetchEntities(account: Account, edge: "adsets" | "ads", ids: string[]) {
  const map = new Map<string, EntityInfo>();
  if (ids.length === 0) return map;

  const fields =
    edge === "ads"
      ? "id,effective_status,preview_shareable_link," +
        "creative.thumbnail_width(600).thumbnail_height(600){instagram_permalink_url,thumbnail_url,image_url}"
      : "id,effective_status";
  const rows = await metaGet<{
    id: string;
    effective_status?: string;
    preview_shareable_link?: string;
    creative?: { instagram_permalink_url?: string; thumbnail_url?: string; image_url?: string };
  }>(account, edge, {
    fields,
    filtering: JSON.stringify([{ field: "id", operator: "IN", value: ids }]),
    limit: "500",
  });

  for (const obj of rows) {
    map.set(obj.id, {
      status: translateStatus(obj.effective_status),
      previewUrl: obj.creative?.instagram_permalink_url || obj.preview_shareable_link,
      thumbnailUrl: obj.creative?.thumbnail_url,
      // Imagem original quando existe (anúncio estático); senão a própria miniatura.
      imageUrl: obj.creative?.image_url || obj.creative?.thumbnail_url,
    });
  }
  return map;
}

function addToAgg(map: Map<string, MetaAgg>, key: string, delta: MetaAgg) {
  const current = map.get(key) || { ...EMPTY_META_AGG };
  current.spend += delta.spend;
  current.conversations += delta.conversations;
  current.firstReplies += delta.firstReplies;
  current.impressions += delta.impressions;
  current.reach += delta.reach;
  current.linkClicks += delta.linkClicks;
  current.landingPageViews += delta.landingPageViews;
  current.pageClicks += delta.pageClicks;
  current.pageConversions += delta.pageConversions;
  current.video3SecViews += delta.video3SecViews;
  current.videoP25 += delta.videoP25;
  current.videoP50 += delta.videoP50;
  current.videoP75 += delta.videoP75;
  current.videoP100 += delta.videoP100;
  map.set(key, current);
}

function derive(agg: MetaAgg) {
  return {
    spend: agg.spend,
    conversations: agg.conversations,
    costPerConversation: agg.conversations > 0 ? agg.spend / agg.conversations : null,
    firstReplies: agg.firstReplies,
    replyRate: agg.conversations > 0 ? (agg.firstReplies / agg.conversations) * 100 : null,
    impressions: agg.impressions,
    reach: agg.reach,
    frequency: agg.reach > 0 ? agg.impressions / agg.reach : null,
    cpm: agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : null,
    linkClicks: agg.linkClicks,
    cpcLink: agg.linkClicks > 0 ? agg.spend / agg.linkClicks : null,
    ctrLink: agg.impressions > 0 ? (agg.linkClicks / agg.impressions) * 100 : null,
    conversationRate: agg.linkClicks > 0 ? (agg.conversations / agg.linkClicks) * 100 : null,
    landingPageViews: agg.landingPageViews,
    pageClicks: agg.pageClicks,
    pageConversions: agg.pageConversions,
    // Taxa de carregamento: de quem clicou, quantos esperaram a página abrir.
    // Só conta campanhas que levam a uma página (o formulário nativo fica de fora).
    loadRate: agg.pageClicks > 0 ? (agg.landingPageViews / agg.pageClicks) * 100 : null,
    // Taxa de conversão da página: de quem viu a página, quantos viraram lead.
    pageConversionRate:
      agg.landingPageViews > 0 ? (agg.pageConversions / agg.landingPageViews) * 100 : null,
    video3SecViews: agg.video3SecViews,
    videoP25: agg.videoP25,
    videoP50: agg.videoP50,
    videoP75: agg.videoP75,
    videoP100: agg.videoP100,
    hookRate: agg.impressions > 0 ? (agg.video3SecViews / agg.impressions) * 100 : null,
  };
}

const liveTagOf = (name: string) => /^\[(LS\d+_[QD])/.exec(name)?.[1];

function buildRows(
  aggById: Map<string, MetaAgg>,
  names: Map<string, string>,
  campaignOf: Map<string, string>,
  parents: Map<string, string> | undefined,
  entities: Map<string, EntityInfo>,
  reachById?: Map<string, number>,
  liveOf?: Map<string, string>
): DashboardRow[] {
  const rows: DashboardRow[] = [];
  for (const [id, agg] of aggById) {
    const reach = reachById?.get(id);
    rows.push({
      id,
      campaignId: campaignOf.get(id) || id,
      name: names.get(id) || id,
      parent: parents?.get(id),
      live: liveOf?.get(id),
      status: entities.get(id)?.status,
      previewUrl: entities.get(id)?.previewUrl,
      thumbnailUrl: entities.get(id)?.thumbnailUrl,
      imageUrl: entities.get(id)?.imageUrl,
      ...derive(reach === undefined ? agg : { ...agg, reach }),
    });
  }
  rows.sort((a, b) => b.spend - a.spend);
  return rows;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = resolveRange(searchParams.get("since"), searchParams.get("until"));

    const previous = previousRange(range);
    // A Meta leva ~10s pra responder, então a CDN da Vercel guarda a resposta por
    // 5 min e, vencido esse prazo, ainda entrega a cópia antiga (por até 2 dias)
    // enquanto busca a nova em segundo plano; a tela avisa e pede de novo em seguida.
    // `fresh=` (botão "Atualizar agora") fura o cache.
    const cacheHeaders: Record<string, string> = searchParams.has("fresh")
      ? { "Cache-Control": "no-store" }
      : {
          "Cache-Control": "no-store",
          "Vercel-CDN-Cache-Control": "s-maxage=300, stale-while-revalidate=172800",
        };
    const account = await resolveAccount();

    // Quebras por idade, gênero, posicionamento e dispositivo: só da aba aberta,
    // pedidas depois da tela principal para ela não esperar por 16 consultas a mais.
    const onlyBreakdown = searchParams.get("breakdowns");
    if (onlyBreakdown) {
      const group = GROUPS.find((g) => g.key === onlyBreakdown)?.key;
      if (!group) return NextResponse.json({ error: "Aba desconhecida." }, { status: 400 });
      const live = searchParams.get("live");
      const campaignIds = live
        ? account.list.filter((c) => liveTagOf(c.name) === live).map((c) => c.id)
        : undefined;
      const [key, value] = await fetchBreakdowns(account, group, range, campaignIds);
      return NextResponse.json({ range, resultBreakdowns: { [key]: value } }, { headers: cacheHeaders });
    }
    const campaigns = account.list;
    const groupKeys = GROUPS.map((g) => g.key);
    const emptyDaily = { total: new Map<string, MetaAgg>(), byCampaign: new Map<string, Map<string, MetaAgg>>() };

    // Sem nenhuma campanha com as tags, o filtro `IN []` daria erro na Meta.
    const hasCampaigns = campaigns.length > 0;
    const [part, groupReachList] = await Promise.all([
      hasCampaigns ? loadAccount(account, range, previous) : null,
      Promise.all(groupKeys.map((group) => fetchGroupReach(account, group, range, previous))),
    ]);
    const groupReach = new Map(groupReachList);

    const metaAds = part?.metaAds ?? [];
    const accountTotals = part?.totals ?? EMPTY_META_AGG;
    const previousAccountTotals = part?.previousTotals ?? EMPTY_META_AGG;
    const campaignReach = part?.campaignReach ?? new Map<string, number>();
    const adsetReach = part?.adsetReach ?? new Map<string, number>();
    const previousCampaignTotals = part?.previousCampaignTotals ?? new Map<string, MetaAgg>();
    const adsetEntities = part?.adsetEntities ?? new Map<string, EntityInfo>();
    const adEntities = part?.adEntities ?? new Map<string, EntityInfo>();
    const daily = part?.daily ?? emptyDaily;

    const names = new Map<string, string>();
    // Na tela, a "campanha" de cada linha é o produto (a aba) a que ela pertence.
    const groupOf = new Map<string, string>();
    const adParents = new Map<string, string>();
    const byAd = new Map<string, MetaAgg>();
    const byAdset = new Map<string, MetaAgg>();
    const byCampaign = new Map<string, MetaAgg>();
    const campaignEntities = new Map<string, { status?: string }>();
    // Número da live de cada campanha, conjunto e anúncio (só as campanhas de Live Secreta têm).
    const liveOf = new Map<string, string>();

    // Campanhas ativas entram sempre (mesmo sem veiculação no período); as
    // pausadas/antigas só aparecem se tiverem gasto no período selecionado.
    for (const campaign of campaigns) {
      groupOf.set(campaign.id, account.campaigns[campaign.id]);
      const campaignLive = liveTagOf(campaign.name);
      if (campaignLive) liveOf.set(campaign.id, campaignLive);
      if (campaign.effective_status !== "ACTIVE") continue;
      names.set(campaign.id, campaign.name);
      byCampaign.set(campaign.id, { ...EMPTY_META_AGG });
      campaignEntities.set(campaign.id, { status: translateStatus(campaign.effective_status) });
    }

    const campaignStatusById = new Map(campaigns.map((c) => [c.id, c.effective_status]));

    for (const row of metaAds) {
      const group = account.campaigns[row.campaign_id];
      const delta = toAgg(row, group, !!account.formCampaigns[row.campaign_id]);
      names.set(row.ad_id, row.ad_name);
      names.set(row.adset_id, row.adset_name);
      names.set(row.campaign_id, row.campaign_name);
      if (!campaignEntities.has(row.campaign_id)) {
        campaignEntities.set(row.campaign_id, {
          status: translateStatus(campaignStatusById.get(row.campaign_id)),
        });
      }
      groupOf.set(row.ad_id, group);
      groupOf.set(row.adset_id, group);
      const rowLive = liveTagOf(row.campaign_name);
      if (rowLive) {
        liveOf.set(row.ad_id, rowLive);
        liveOf.set(row.adset_id, rowLive);
        liveOf.set(row.campaign_id, rowLive);
      }
      adParents.set(row.ad_id, row.adset_name);
      addToAgg(byAd, row.ad_id, delta);
      addToAgg(byAdset, row.adset_id, delta);
      addToAgg(byCampaign, row.campaign_id, delta);
    }

    // Uma linha por produto: soma das campanhas dele, com o alcance próprio.
    const byGroup = new Map<string, MetaAgg>();
    const groupEntities = new Map<string, { status?: string }>();
    const groupDaily = new Map<string, Map<string, MetaAgg>>();
    const previousByGroup = new Map<string, MetaAgg>();
    for (const group of GROUPS) {
      names.set(group.key, group.name);
      byGroup.set(group.key, { ...EMPTY_META_AGG });
      groupDaily.set(group.key, new Map());
      previousByGroup.set(group.key, { ...EMPTY_META_AGG });
      const statuses = account.stores[group.key].map((id) => campaignStatusById.get(id));
      if (statuses.length > 0) {
        groupEntities.set(group.key, {
          status: translateStatus(statuses.includes("ACTIVE") ? "ACTIVE" : "PAUSED"),
        });
      }
    }
    for (const [id, agg] of byCampaign) addToAgg(byGroup, account.campaigns[id], agg);
    for (const [id, days] of daily.byCampaign) {
      const target = groupDaily.get(account.campaigns[id]);
      if (!target) continue;
      for (const [date, agg] of days) addToAgg(target, date, agg);
    }
    for (const [id, agg] of previousCampaignTotals) {
      addToAgg(previousByGroup, account.campaigns[id], agg);
    }
    const reachByGroup = new Map(groupKeys.map((g) => [g as string, groupReach.get(g)?.reach ?? 0]));

    // Totais, período anterior e evolução diária de cada live, para o filtro por número da live.
    const byLiveAgg = new Map<string, MetaAgg>();
    const previousByLiveAgg = new Map<string, MetaAgg>();
    const dailyByLiveAgg = new Map<string, Map<string, MetaAgg>>();
    const reachByLive = new Map<string, number>();
    const groupOfLive = new Map<string, string>();
    for (const [id, agg] of byCampaign) {
      const live = liveOf.get(id);
      if (!live) continue;
      addToAgg(byLiveAgg, live, agg);
      reachByLive.set(live, (reachByLive.get(live) ?? 0) + (campaignReach.get(id) ?? 0));
      groupOfLive.set(live, account.campaigns[id]);
    }
    for (const [id, agg] of previousCampaignTotals) {
      const live = liveOf.get(id);
      if (live) addToAgg(previousByLiveAgg, live, agg);
    }
    for (const [id, days] of daily.byCampaign) {
      const live = liveOf.get(id);
      if (!live) continue;
      const target = dailyByLiveAgg.get(live) ?? new Map<string, MetaAgg>();
      for (const [date, agg] of days) addToAgg(target, date, agg);
      dailyByLiveAgg.set(live, target);
    }
    const liveNames = new Map([...byLiveAgg.keys()].map((live) => [live, live]));
    const byLive: Record<string, DashboardRow> = {};
    for (const row of buildRows(byLiveAgg, liveNames, groupOfLive, undefined, new Map(), reachByLive)) {
      byLive[row.id] = { ...row, live: row.id };
    }
    const previousByLive: Record<string, ReturnType<typeof derive>> = {};
    for (const [live, agg] of previousByLiveAgg) previousByLive[live] = derive(agg);
    const dailyByLive: Record<string, ReturnType<typeof buildDailyPoints>> = {};
    for (const [live, days] of dailyByLiveAgg) dailyByLive[live] = buildDailyPoints(days, range);

    const dailyByCampaign: Record<string, ReturnType<typeof buildDailyPoints>> = {};
    const previousByCampaign: Record<string, ReturnType<typeof derive>> = {};
    for (const group of groupKeys) {
      dailyByCampaign[group] = buildDailyPoints(groupDaily.get(group), range);
      previousByCampaign[group] = derive({
        ...(previousByGroup.get(group) ?? EMPTY_META_AGG),
        reach: groupReach.get(group)?.previousReach ?? 0,
      });
    }

    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        range,
        previousRange: previous,
        totals: derive(accountTotals),
        previousTotals: derive(previousAccountTotals),
        previousByCampaign,
        byLive,
        previousByLive,
        dailyByLive,
        levels: {
          campaigns: buildRows(byGroup, names, groupOf, undefined, groupEntities, reachByGroup),
          realCampaigns: buildRows(
            byCampaign,
            names,
            groupOf,
            undefined,
            campaignEntities,
            campaignReach,
            liveOf
          ),
          adsets: buildRows(byAdset, names, groupOf, undefined, adsetEntities, adsetReach, liveOf),
          ads: buildRows(byAd, names, groupOf, adParents, adEntities, undefined, liveOf),
        },
        dailyChart: buildDailyPoints(daily.total, range),
        dailyByCampaign,
      },
      { headers: cacheHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
