"use client";

import { useEffect, useMemo, useState } from "react";

type Kind = "lsq" | "lsd" | "promo" | "li35" | "li36";

type Linha = {
  chave: string;
  campanha: string;
  grupo: string;
  membros: number;
  webhook: number;
  base: number;
};

// Campanhas do SendFlow de cada aba; as das lives aparecem sozinhas quando chega o primeiro aviso.
const CAMPANHAS_CONHECIDAS: Record<Kind, string[]> = {
  lsq: [],
  lsd: [],
  promo: ["[TS] PROMOÇÕES DIÁRIAS", "[NTS] PROMOÇÕES DIÁRIAS"],
  li35: [
    "[LI35] [TS] BLACK FRIDAY TSX",
    "[LI35] [NTS] BLACK FRIDAY TSX",
    "[LI35] [ALUNAS] BLACK FRIDAY",
  ],
  li36: ["[LI36] [TS] SEM DRAMA", "[LI36] [NTS] SEM DRAMA"],
};

const semAcento = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "");

function daAba(kind: Kind, campanha: string, live: string) {
  const nome = semAcento(campanha.trim()).toUpperCase();
  if (kind === "li35") return nome.startsWith("[LI35]");
  if (kind === "li36") return nome.startsWith("[LI36]");
  if (kind === "promo") return nome.includes("PROMOCOES DIARIAS");
  const m = /^\[(LS\d+_([QD]))\]/.exec(nome);
  if (!m || m[2] !== (kind === "lsq" ? "Q" : "D")) return false;
  return !live || m[1] === live.toUpperCase();
}

const numero = (valor: number) => valor.toLocaleString("pt-BR");
const ordem = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true });

const cabecalho = "px-2.5 py-2.5 text-center";
const celula = "px-2.5 py-2.5 text-center";
const campo =
  "rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-gray-500";
const botao =
  "rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50";

export default function GruposSection({ kind, live }: { kind: Kind; live: string }) {
  const [linhas, setLinhas] = useState<Linha[]>();
  const [erro, setErro] = useState("");
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState("");
  const [aviso, setAviso] = useState("");
  const [nova, setNova] = useState({ campanha: "", grupo: "", quantidade: "" });

  useEffect(() => {
    let cancelado = false;
    fetch("/api/grupos")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error();
        if (!cancelado) setLinhas(json.linhas as Linha[]);
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar os grupos agora.");
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const daAbaAtual = useMemo(
    () =>
      (linhas ?? [])
        .filter((l) => daAba(kind, l.campanha, live))
        .sort((a, b) => ordem(a.campanha, b.campanha) || ordem(a.grupo, b.grupo)),
    [linhas, kind, live],
  );

  const porCampanha = useMemo(() => {
    const mapa = new Map<string, { campanha: string; grupos: number; membros: number }>();
    for (const l of daAbaAtual) {
      const atual = mapa.get(l.campanha) ?? { campanha: l.campanha, grupos: 0, membros: 0 };
      atual.grupos += 1;
      atual.membros += l.membros;
      mapa.set(l.campanha, atual);
    }
    return [...mapa.values()];
  }, [daAbaAtual]);

  const total = daAbaAtual.reduce((soma, l) => soma + l.membros, 0);
  const sugestoes = [
    ...new Set([...CAMPANHAS_CONHECIDAS[kind], ...daAbaAtual.map((l) => l.campanha)]),
  ];

  async function salvar(campanha: string, grupo: string, quantidade: string) {
    const chave = `${campanha}||${grupo}`;
    setSalvando(chave);
    setAviso("");
    try {
      const res = await fetch("/api/grupos/ajuste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campanha, grupo, quantidade: Number(quantidade) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Não foi possível salvar.");
      const linha = json.linha as Linha;
      setLinhas((atuais) => [...(atuais ?? []).filter((l) => l.chave !== linha.chave), linha]);
      setRascunhos((atuais) =>
        Object.fromEntries(Object.entries(atuais).filter(([chave]) => chave !== linha.chave)),
      );
      return true;
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
      return false;
    } finally {
      setSalvando("");
    }
  }

  async function adicionar() {
    if (!nova.campanha.trim() || !nova.grupo.trim() || nova.quantidade.trim() === "") {
      setAviso("Preencha a campanha, o nome do grupo e quantas pessoas ele tem.");
      return;
    }
    if (await salvar(nova.campanha.trim(), nova.grupo.trim(), nova.quantidade)) {
      setNova({ campanha: "", grupo: "", quantidade: "" });
    }
  }

  return (
    <section className="mb-6">
      <div className="mb-4 mt-2 border-b border-gray-200 pb-2">
        <h2 className="text-lg font-bold text-gray-900">Pessoas nos grupos do WhatsApp</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Número digitado à mão (quantas pessoas o grupo tinha na hora) somado às entradas e saídas
          que chegam pelo SendFlow. Em cada grupo, o número digitado vira o total do momento.
        </p>
      </div>

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}
      {!linhas && !erro && <p className="text-sm text-gray-500">Carregando os grupos…</p>}

      {linhas && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="min-w-[170px] rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="text-xs text-gray-500">Total nas campanhas desta aba</div>
              <div className="text-2xl font-bold text-gray-900">{numero(total)}</div>
              <div className="text-xs text-gray-500">
                {daAbaAtual.length} {daAbaAtual.length === 1 ? "grupo" : "grupos"}
              </div>
            </div>
            {porCampanha.map((c) => (
              <div
                key={c.campanha}
                className="min-w-[170px] rounded-lg border border-gray-200 px-4 py-3"
              >
                <div className="text-xs text-gray-500">{c.campanha}</div>
                <div className="text-xl font-bold text-gray-900">{numero(c.membros)}</div>
                <div className="text-xs text-gray-500">
                  {c.grupos} {c.grupos === 1 ? "grupo" : "grupos"}
                </div>
              </div>
            ))}
          </div>

          {daAbaAtual.length > 0 ? (
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm" style={{ minWidth: 820 }}>
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="border-b border-gray-200 text-xs tracking-wide text-gray-500">
                    <th className="px-2.5 py-2.5 text-left">Campanha</th>
                    <th className="px-2.5 py-2.5 text-left">Grupo</th>
                    <th className={cabecalho}>Pessoas no grupo</th>
                    <th className={cabecalho}>Base digitada</th>
                    <th className={cabecalho}>Entradas − saídas</th>
                    <th className={cabecalho}>Atualizar total</th>
                  </tr>
                </thead>
                <tbody>
                  {daAbaAtual.map((l) => (
                    <tr key={l.chave} className="border-b border-gray-100 text-gray-800">
                      <td className="px-2.5 py-2.5 text-left">{l.campanha}</td>
                      <td className="px-2.5 py-2.5 text-left">{l.grupo}</td>
                      <td className={`${celula} font-semibold`}>{numero(l.membros)}</td>
                      <td className={celula}>{numero(l.base)}</td>
                      <td className={celula}>{numero(l.webhook)}</td>
                      <td className={celula}>
                        <div className="flex items-center justify-center gap-2">
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            placeholder="Quantas hoje"
                            value={rascunhos[l.chave] ?? ""}
                            onChange={(e) =>
                              setRascunhos((atuais) => ({ ...atuais, [l.chave]: e.target.value }))
                            }
                            className={`${campo} w-28`}
                          />
                          <button
                            type="button"
                            className={botao}
                            disabled={
                              (rascunhos[l.chave] ?? "") === "" ||
                              salvando === `${l.campanha}||${l.grupo}`
                            }
                            onClick={() => salvar(l.campanha, l.grupo, rascunhos[l.chave])}
                          >
                            Salvar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Nenhum grupo desta aba ainda. Os grupos aparecem aqui quando chega o primeiro aviso do
              SendFlow, ou você pode adicionar um abaixo.
            </p>
          )}

          <div className="mt-5 border-t border-gray-100 pt-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Adicionar grupo à mão</h3>
            <div className="flex flex-wrap items-center gap-2">
              <input
                list={`campanhas-${kind}`}
                placeholder="Campanha do SendFlow"
                value={nova.campanha}
                onChange={(e) => setNova({ ...nova, campanha: e.target.value })}
                className={`${campo} w-72`}
              />
              <datalist id={`campanhas-${kind}`}>
                {sugestoes.map((nome) => (
                  <option key={nome} value={nome} />
                ))}
              </datalist>
              <input
                placeholder="Nome do grupo (igual ao do SendFlow)"
                value={nova.grupo}
                onChange={(e) => setNova({ ...nova, grupo: e.target.value })}
                className={`${campo} w-64`}
              />
              <input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="Pessoas hoje"
                value={nova.quantidade}
                onChange={(e) => setNova({ ...nova, quantidade: e.target.value })}
                className={`${campo} w-32`}
              />
              <button
                type="button"
                className={botao}
                disabled={salvando !== ""}
                onClick={adicionar}
              >
                Adicionar
              </button>
            </div>
            {aviso && <p className="mt-2 text-sm text-red-600">{aviso}</p>}
            <p className="mt-2 text-xs text-gray-500">
              O nome da campanha e do grupo precisa ser igual ao do SendFlow, para as entradas e
              saídas do webhook caírem no mesmo grupo.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
