# Dashboard Silhouette Experts

Dashboard de acompanhamento das campanhas de captação de leads da Silhouette Experts no Meta Ads e, no LI35 e no LI36, também no Google Ads.

Versão publicada: https://dashboard-juliana-delamura.vercel.app

## Abas

- **Resumo Geral**: visão consolidada das três frentes de captação.
- **Lives Secretas Quarta**: campanhas com `LIVE_SECRETA` no nome e código `[LS###_Q…]` (só Meta Ads). Resultado: leads.
- **Lives Secretas Domingo**: campanhas com `LIVE_SECRETA` no nome e código `[LS###_D…]` (só Meta Ads). Resultado: leads.
- **Promo Diário**: campanhas com `PROMO_DIARIA` no nome e a campanha `[LOJA] [FORM] Promo Diária` (só Meta Ads). Resultado: leads.
- **Lançamento LI35**: campanhas com `[LI35]` no nome. Meta Ads primeiro e Google Ads depois, com um total das duas plataformas no fim.
- **Lançamento LI36**: igual à do LI35. Meta Ads com `[LI36]_[CAPTURA]_[LEADS]` no nome e Google Ads com `[LI36]_[CAPTURA]_[GG_ADS]`; leads TS/NTS e pesquisa vêm da planilha do LI36 (`/api/leads`, `/api/google` e `/api/pesquisa` recebem `?edition=li36`; sem o parâmetro valem os dados do LI35). A planilha do LI36 precisa estar compartilhada por link (Leitor), como a do LI35.

Campanhas de formulário nativo (`FORM_NATIVO` ou `[FORM]` no nome) ficam sem as taxas da página. Todas as tabelas têm filtro de status e busca por nome.

Na aba **Lançamento LI35** há também a seção **Leads TS e NTS (planilha)**, que lê a aba `Leads C/UTM` da planilha "[LI35] Resultado da Pesquisa" (compartilhada por link, sem credencial). TS = respondeu "Sim" em "Você já tem Silhouette?", NTS = "Não". Só entram inscrições com `paid` na UTM de origem (tráfego pago): `fb-paid-hot` e `fb-paid-cold` no Meta Ads e `yt-paid-hot` no Google Ads. O custo por lead TS é o investimento do Meta Ads somado ao do Google Ads dividido pelos leads TS da planilha.

O período padrão de todas as abas é **Últimos 7 dias**. Nas abas Lives Secretas Quarta e Domingo há um comparativo por live; na aba LI35, o custo por lead TS por público (conjunto) e por criativo (anúncio), cruzando o gasto do Meta com as UTMs da planilha.

No fim da aba **Lançamento LI35**, a seção **Dados da Pesquisa** lê a aba `Respostas pesquisa` da planilha (máquina, frase que descreve, uso, curso, desejo, objeção, estado, idade, canal, temperatura, renda e se tem Silhouette), com filtros de fonte, campanha (posicionamento), público (conjunto) e anúncio, mais leads, respostas e taxa de resposta, no total e por dia. O público de cada resposta vem do e-mail na aba de leads; os e-mails são lidos só no servidor e nunca saem na resposta da rota.

As campanhas entram em cada aba pela tag no nome: campanha nova com a tag aparece sozinha. Entram as ativas e as pausadas que tiveram gasto no período escolhido. O resultado é o mesmo da coluna "Resultados" do Gerenciador de Anúncios (leads por formulário nativo ou pelo pixel).

## Rodar localmente

```bash
npm install
npm run dev
```

É preciso um arquivo `.env.local` com `META_ACCESS_TOKEN` (token com acesso à conta de anúncios) e, para a parte do Google Ads, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET` e `GOOGLE_ADS_REFRESH_TOKEN`.
