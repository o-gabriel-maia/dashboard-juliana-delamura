// Imagem do anúncio no formato real, para a prévia ampliada da tabela de anúncios.
//
// A miniatura da Meta (`thumbnail_url` com largura e altura fixas) vem recortada em
// quadrado, e `image_url` só existe em anúncio de imagem única. Nos anúncios com
// imagem de feed + stories (personalização por posicionamento), carrossel ou vídeo,
// a imagem original é buscada pelo hash na biblioteca de imagens da conta
// (`act_<id>/adimages`), que devolve o arquivo no tamanho em que foi enviado.

// Post do Instagram impulsionado não tem imagem na biblioteca da conta: a mídia
// original vem do próprio Instagram (capa do vídeo ou a imagem do post).

// Campos a pedir dentro de `creative{...}`, além dos que o dashboard já usa.
export const CREATIVE_IMAGE_FIELDS =
  "image_url,image_hash,effective_instagram_media_id,asset_feed_spec{images},object_story_spec{link_data{image_hash,picture,child_attachments{image_hash,picture}},video_data{image_url,image_hash}}";

export type CreativeImageInfo = {
  image_url?: string;
  effective_instagram_media_id?: string;
  image_hash?: string;
  thumbnail_url?: string;
  asset_feed_spec?: { images?: { hash?: string }[] };
  object_story_spec?: {
    link_data?: {
      image_hash?: string;
      picture?: string;
      child_attachments?: { image_hash?: string; picture?: string }[];
    };
    video_data?: { image_url?: string; image_hash?: string };
  };
};

export type AdImage = { hash: string; url?: string; width?: number; height?: number };

// Hashes candidatos de um criativo, na ordem de preferência.
function candidateHashes(c: CreativeImageInfo): string[] {
  const feed = c.asset_feed_spec?.images?.map((i) => i.hash).filter((h): h is string => !!h);
  if (feed && feed.length > 0) return feed;
  const link = c.object_story_spec?.link_data;
  const first = [
    c.image_hash,
    link?.image_hash,
    link?.child_attachments?.[0]?.image_hash,
    c.object_story_spec?.video_data?.image_hash,
  ].find((h): h is string => !!h);
  return first ? [first] : [];
}

// Entre feed (1:1 ou 4:5) e stories (9:16), a prévia mostra a de feed: é a mais
// próxima de 4:5. Sem medidas, fica a primeira.
function pickFeedImage(images: AdImage[]): AdImage | undefined {
  const withSize = images.filter((i) => i.url && i.width && i.height);
  if (withSize.length === 0) return images.find((i) => i.url);
  return withSize.reduce((best, img) =>
    Math.abs(img.height! / img.width! - 1.25) < Math.abs(best.height! / best.width! - 1.25)
      ? img
      : best
  );
}

// Mídia original dos posts do Instagram (até 50 por chamada): capa do vídeo, imagem do
// post ou a primeira do carrossel. Falha aqui só deixa a prévia com a miniatura.
async function fetchInstagramMedia(creatives: CreativeImageInfo[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const token = process.env.META_ACCESS_TOKEN;
  const ids = [...new Set(creatives.map((c) => c.effective_instagram_media_id!))];
  if (!token || ids.length === 0) return out;
  type Media = { media_type?: string; media_url?: string; thumbnail_url?: string };
  try {
    for (let i = 0; i < ids.length; i += 50) {
      const qs = new URLSearchParams({
        ids: ids.slice(i, i + 50).join(","),
        fields: "media_type,media_url,thumbnail_url",
        access_token: token,
      });
      const res = await fetch(`https://graph.facebook.com/v21.0/?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (json.error) continue;
      for (const [id, value] of Object.entries(json)) {
        const m = value as Media;
        const url = m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url || m.thumbnail_url;
        if (url) out.set(id, url);
      }
    }
  } catch {
    // sem a mídia do Instagram, fica a miniatura
  }
  return out;
}

// Devolve, para cada criativo, a URL da imagem no formato real. `fetchImages` busca
// na conta de anúncios os hashes pedidos (até 50 por chamada); se falhar, a prévia
// continua com a imagem que havia antes.
export async function resolveOriginalImages(
  creatives: CreativeImageInfo[],
  fetchImages: (hashes: string[]) => Promise<AdImage[]>
): Promise<Map<CreativeImageInfo, string>> {
  const result = new Map<CreativeImageInfo, string>();
  const pending: { creative: CreativeImageInfo; hashes: string[] }[] = [];
  for (const c of creatives) {
    if (c.image_url) {
      result.set(c, c.image_url);
      continue;
    }
    const hashes = candidateHashes(c);
    if (hashes.length > 0) pending.push({ creative: c, hashes });
  }

  const allHashes = [...new Set(pending.flatMap((p) => p.hashes))];
  const byHash = new Map<string, AdImage>();
  try {
    for (let i = 0; i < allHashes.length; i += 50) {
      for (const img of await fetchImages(allHashes.slice(i, i + 50))) byHash.set(img.hash, img);
    }
  } catch {
    // Sem a biblioteca de imagens, cada criativo cai na alternativa abaixo.
  }

  for (const { creative, hashes } of pending) {
    const chosen = pickFeedImage(hashes.map((h) => byHash.get(h)).filter((i): i is AdImage => !!i));
    if (chosen?.url) result.set(creative, chosen.url);
  }

  const igMedia = await fetchInstagramMedia(
    creatives.filter((c) => !result.has(c) && c.effective_instagram_media_id)
  );
  for (const c of creatives) {
    const url = c.effective_instagram_media_id && igMedia.get(c.effective_instagram_media_id);
    if (!result.has(c) && url) result.set(c, url);
  }

  for (const c of creatives) {
    if (result.has(c)) continue;
    const fallback =
      c.object_story_spec?.video_data?.image_url ||
      c.object_story_spec?.link_data?.picture ||
      c.object_story_spec?.link_data?.child_attachments?.[0]?.picture;
    if (fallback) result.set(c, fallback);
  }
  return result;
}
