# Dashboard Silhouette Experts

Dashboard de acompanhamento das campanhas de captação de leads da Silhouette Experts no Meta Ads e, no LI 35, também no Google Ads.

## Abas

- **Resumo Geral**: visão consolidada das três frentes de captação.
- **Captação Live Secreta**: campanhas com `LIVE_SECRETA` no nome (só Meta Ads). Resultado: leads.
- **Captação Promo Diária**: campanhas com `PROMO_DIARIA` no nome (só Meta Ads). Resultado: leads.
- **Captação LI 35**: campanhas com `[LI35]` no nome. Meta Ads primeiro e Google Ads depois, com um total das duas plataformas no fim.

As campanhas entram em cada aba pela tag no nome: campanha nova com a tag aparece sozinha. Entram as ativas e as pausadas que tiveram gasto no período escolhido. O resultado é o mesmo da coluna "Resultados" do Gerenciador de Anúncios (leads por formulário nativo ou pelo pixel).

## Rodar localmente

```bash
npm install
npm run dev
```

É preciso um arquivo `.env.local` com `META_ACCESS_TOKEN` (token com acesso à conta de anúncios) e, para a parte do Google Ads, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET` e `GOOGLE_ADS_REFRESH_TOKEN`.
