import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type DateRange = { since: string; until: string };

// Conta do Google Ads da Silhouette Experts (acessada direto, sem MCC).
const CUSTOMER_ID = "7432481101";
const LOGIN_CUSTOMER_ID = "7432481101";
// Entram as campanhas cujo nome tem todos esses trechos (captação do LI35).
const CAMPAIGN_TAGS = ["LI35"];
const API_URL = `https://googleads.googleapis.com/v25/customers/${CUSTOMER_ID}/googleAds:searchStream`;
const DEFAULT_RANGE_DAYS = 7;
const MAX_RANGE_DAYS = 370;
const METRICS = "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions";

type Agg = { spend: number; impressions: number; clicks: number; leads: number };
const EMPTY: Agg = { spend: 0, impressions: 0, clicks: 0, leads: 0 };

type GoogleMetrics = {
  costMicros?: string;
  impressions?: string;
  clicks?: string;
  conversions?: number;
};

type GoogleRow = {
  campaign?: { id: string; name?: string; status?: string };
  adGroup?: { id: string; name?: string; status?: string };
  adGroupAd?: {
    status?: string;
    ad?: {
      id: string;
      name?: string;
      demandGenVideoResponsiveAd?: { videos?: { asset: string }[] };
    };
  };
  asset?: { resourceName: string; youtubeVideoAsset?: { youtubeVideoId?: string } };
  segments?: { date?: string };
  metrics?: GoogleMetrics;
};

function toAgg(m: GoogleMetrics | undefined): Agg {
  return {
    spend: Number(m?.costMicros ?? 0) / 1_000_000,
    impressions: Number(m?.impressions ?? 0),
    clicks: Number(m?.clicks ?? 0),
    leads: Number(m?.conversions ?? 0),
  };
}

function add(a: Agg, b: Agg): Agg {
  return {
    spend: a.spend + b.spend,
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    leads: a.leads + b.leads,
  };
}

function addTo<K>(map: Map<K, Agg>, key: K, delta: Agg) {
  map.set(key, add(map.get(key) ?? EMPTY, delta));
}

// Mesmo formato das linhas da Meta, pra página reaproveitar cards, gráfico e
// tabelas. O Google não informa alcance, e a visita à página não vem por aqui.
function derive(a: Agg) {
  return {
    spend: a.spend,
    conversations: a.leads,
    costPerConversation: a.leads > 0 ? a.spend / a.leads : null,
    firstReplies: 0,
    replyRate: null,
    impressions: a.impressions,
    reach: null,
    frequency: null,
    cpm: a.impressions > 0 ? (a.spend / a.impressions) * 1000 : null,
    linkClicks: a.clicks,
    cpcLink: a.clicks > 0 ? a.spend / a.clicks : null,
    ctrLink: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : null,
    conversationRate: a.clicks > 0 ? (a.leads / a.clicks) * 100 : null,
    landingPageViews: 0,
    pageClicks: 0,
    pageConversions: 0,
    loadRate: null,
    pageConversionRate: null,
    video3SecViews: 0,
    videoP25: 0,
    videoP50: 0,
    videoP75: 0,
    videoP100: 0,
    hookRate: null,
  };
}

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

// Período imediatamente anterior, com a mesma duração do período selecionado.
function previousRange(range: DateRange): DateRange {
  const days =
    Math.round(
      (Date.parse(`${range.until}T00:00:00Z`) - Date.parse(`${range.since}T00:00:00Z`)) / 86400000
    ) + 1;
  const until = addDays(range.since, -1);
  return { since: addDays(until, -(days - 1)), until };
}

async function accessToken() {
  const { GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_ADS_CLIENT_ID || !GOOGLE_ADS_CLIENT_SECRET || !GOOGLE_ADS_REFRESH_TOKEN) {
    throw new Error("Credenciais do Google Ads não configuradas.");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    cache: "no-store",
    body: new URLSearchParams({
      client_id: GOOGLE_ADS_CLIENT_ID,
      client_secret: GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error("O Google recusou a autorização. É preciso renovar o acesso ao Google Ads.");
  }
  return json.access_token as string;
}

async function gaql(token: string, query: string): Promise<GoogleRow[]> {
  const res = await fetch(API_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "login-customer-id": LOGIN_CUSTOMER_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (!Array.isArray(json)) {
    const detail = json?.error?.details?.[0]?.errors?.[0]?.message ?? json?.error?.message;
    throw new Error(detail ? `Google Ads: ${detail}` : "O Google Ads não respondeu à consulta.");
  }
  return json.flatMap((chunk: { results?: GoogleRow[] }) => chunk.results ?? []);
}

const STATUS_LABELS: Record<string, string> = {
  ENABLED: "Ativo",
  PAUSED: "Pausado",
  REMOVED: "Removido",
};
const translateStatus = (status?: string) => (status ? (STATUS_LABELS[status] ?? status) : undefined);

// Preenche todos os dias do período, mesmo sem dado, pra não quebrar o eixo do gráfico.
function buildDailyPoints(byDate: Map<string, Agg>, range: DateRange) {
  const days = [];
  for (let date = range.since; date <= range.until; date = addDays(date, 1)) {
    const d = byDate.get(date) ?? EMPTY;
    days.push({
      date,
      spend: d.spend,
      conversations: d.leads,
      costPerConversation: d.leads > 0 ? d.spend / d.leads : null,
      impressions: d.impressions,
      cpm: d.impressions > 0 ? (d.spend / d.impressions) * 1000 : null,
      ctrLink: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : null,
      cpcLink: d.clicks > 0 ? d.spend / d.clicks : null,
      conversationRate: d.clicks > 0 ? (d.leads / d.clicks) * 100 : null,
    });
  }
  return days;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = resolveRange(searchParams.get("since"), searchParams.get("until"));
    const previous = previousRange(range);
    const token = await accessToken();

    // No LIKE do Google, colchete literal vai entre colchetes.
    const nameFilter = CAMPAIGN_TAGS.map(
      (tag) => `campaign.name LIKE '%${tag.replace(/\[/g, "[[]").replace(/(?<!\[)\]/g, "[]]")}%'`
    ).join(" AND ");
    const campaigns = await gaql(
      token,
      `SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.status != 'REMOVED' AND ${nameFilter}`
    );
    const ids = campaigns.map((r) => r.campaign!.id);

    const byCampaign = new Map<string, Agg>();
    const byDate = new Map<string, Agg>();
    let previousTotal = EMPTY;
    let adGroupRows: GoogleRow[] = [];
    let adRows: GoogleRow[] = [];

    // Sem campanha com as tags, o filtro `IN ()` daria erro.
    if (ids.length > 0) {
      const inIds = `campaign.id IN (${ids.join(", ")})`;
      const between = (r: DateRange) => `segments.date BETWEEN '${r.since}' AND '${r.until}'`;
      const [daily, before, groups, ads] = await Promise.all([
        gaql(
          token,
          `SELECT campaign.id, segments.date, ${METRICS} FROM campaign WHERE ${inIds} AND ${between(range)}`
        ),
        gaql(token, `SELECT campaign.id, ${METRICS} FROM campaign WHERE ${inIds} AND ${between(previous)}`),
        gaql(
          token,
          `SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status, ${METRICS} FROM ad_group WHERE ${inIds} AND ${between(range)}`
        ),
        gaql(
          token,
          `SELECT campaign.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.demand_gen_video_responsive_ad.videos, ad_group_ad.status, ${METRICS} FROM ad_group_ad WHERE ${inIds} AND ${between(range)}`
        ),
      ]);
      for (const row of daily) {
        const agg = toAgg(row.metrics);
        addTo(byCampaign, row.campaign!.id, agg);
        if (row.segments?.date) addTo(byDate, row.segments.date, agg);
      }
      for (const row of before) previousTotal = add(previousTotal, toAgg(row.metrics));
      adGroupRows = groups;
      adRows = ads;
    }

    let total = EMPTY;
    for (const agg of byCampaign.values()) total = add(total, agg);

    // Campanhas ativas entram sempre; as pausadas só com veiculação no período.
    const campaignLevel = campaigns
      .filter((r) => r.campaign!.status === "ENABLED" || byCampaign.has(r.campaign!.id))
      .map((r) => ({
        id: r.campaign!.id,
        campaignId: r.campaign!.id,
        name: r.campaign!.name ?? r.campaign!.id,
        status: translateStatus(r.campaign!.status),
        ...derive(byCampaign.get(r.campaign!.id) ?? EMPTY),
      }));
    const adGroupLevel = adGroupRows.map((r) => ({
      id: r.adGroup!.id,
      campaignId: r.campaign!.id,
      name: r.adGroup!.name ?? r.adGroup!.id,
      status: translateStatus(r.adGroup!.status),
      ...derive(toAgg(r.metrics)),
    }));
    // Vídeo de cada anúncio no YouTube, pra prévia e pro link da tabela. É
    // informação de apoio: se a consulta falhar, a tabela sai sem a prévia.
    const videoOf = (r: GoogleRow) => r.adGroupAd?.ad?.demandGenVideoResponsiveAd?.videos?.[0]?.asset;
    const assetNames = [...new Set(adRows.map(videoOf).filter((a): a is string => !!a))];
    const youtubeIds = new Map<string, string>();
    if (assetNames.length > 0) {
      try {
        const assets = await gaql(
          token,
          `SELECT asset.resource_name, asset.youtube_video_asset.youtube_video_id FROM asset WHERE asset.resource_name IN (${assetNames.map((a) => `'${a}'`).join(", ")})`
        );
        for (const row of assets) {
          const id = row.asset?.youtubeVideoAsset?.youtubeVideoId;
          if (row.asset && id) youtubeIds.set(row.asset.resourceName, id);
        }
      } catch {
        // segue sem prévia
      }
    }
    const adLevel = adRows.map((r) => {
      const videoId = youtubeIds.get(videoOf(r) ?? "");
      const thumbnail = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined;
      return {
        id: `${r.adGroup?.name ?? ""}:${r.adGroupAd!.ad!.id}`,
        campaignId: r.campaign!.id,
        name: r.adGroupAd!.ad!.name || `Anúncio ${r.adGroupAd!.ad!.id}`,
        parent: r.adGroup?.name,
        status: translateStatus(r.adGroupAd!.status),
        previewUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined,
        thumbnailUrl: thumbnail,
        imageUrl: thumbnail,
        ...derive(toAgg(r.metrics)),
      };
    });
    const bySpend = (a: { spend: number }, b: { spend: number }) => b.spend - a.spend;

    // Mesmo cache dos dados da Meta: a CDN guarda por 5 min e, vencido o prazo,
    // entrega a cópia antiga enquanto busca a nova. `fresh=` fura o cache.
    const cacheHeaders: Record<string, string> = searchParams.has("fresh")
      ? { "Cache-Control": "no-store" }
      : {
          "Cache-Control": "no-store",
          "Vercel-CDN-Cache-Control": "s-maxage=300, stale-while-revalidate=172800",
        };

    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        range,
        previousRange: previous,
        totals: derive(total),
        previousTotals: derive(previousTotal),
        levels: {
          campaigns: campaignLevel.sort(bySpend),
          adsets: adGroupLevel.sort(bySpend),
          ads: adLevel.sort(bySpend),
        },
        dailyChart: buildDailyPoints(byDate, range),
      },
      { headers: cacheHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
