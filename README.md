# Dashboard Silhouette Experts

Dashboard de acompanhamento das campanhas de captação de leads da Silhouette Experts no Meta Ads e, no LI 35, também no Google Ads.

Versão publicada: https://dashboard-juliana-delamura.vercel.app

## Abas

- **Resumo Geral**: visão consolidada das três frentes de captação.
- **Live Secreta Quarta**: campanhas com `LIVE_SECRETA` no nome e código `[LS###_Q…]` (só Meta Ads). Resultado: leads.
- **Live Secreta Domingo**: campanhas com `LIVE_SECRETA` no nome e código `[LS###_D…]` (só Meta Ads). Resultado: leads.
- **Captação Promo Diária**: campanhas com `PROMO_DIARIA` no nome e a campanha `[LOJA] [FORM] Promo Diária` (só Meta Ads). Resultado: leads.
- **Captação LI 35**: campanhas com `[LI35]` no nome. Meta Ads primeiro e Google Ads depois, com um total das duas plataformas no fim.

Campanhas de formulário nativo (`FORM_NATIVO` ou `[FORM]` no nome) ficam sem as taxas da página. Todas as tabelas têm filtro de status e busca por nome.

Na aba **Captação LI 35** há também a seção **Leads TS e NTS (planilha)**, que lê a aba `Leads C/UTM` da planilha "[LI35] Resultado da Pesquisa" (compartilhada por link, sem credencial). TS = respondeu "Sim" em "Você já tem Silhouette?", NTS = "Não". Só entram inscrições com `paid` na UTM de origem (tráfego pago). O custo por lead TS é o investimento do Meta Ads somado ao do Google Ads dividido pelos leads TS da planilha.

As campanhas entram em cada aba pela tag no nome: campanha nova com a tag aparece sozinha. Entram as ativas e as pausadas que tiveram gasto no período escolhido. O resultado é o mesmo da coluna "Resultados" do Gerenciador de Anúncios (leads por formulário nativo ou pelo pixel).

## Rodar localmente

```bash
npm install
npm run dev
```

É preciso um arquivo `.env.local` com `META_ACCESS_TOKEN` (token com acesso à conta de anúncios) e, para a parte do Google Ads, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET` e `GOOGLE_ADS_REFRESH_TOKEN`.
