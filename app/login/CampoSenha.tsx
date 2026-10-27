"use client";

import { useState } from "react";

export default function CampoSenha() {
  const [visivel, setVisivel] = useState(false);

  return (
    <div className="relative">
      <input
        type={visivel ? "text" : "password"}
        name="senha"
        required
        autoComplete="current-password"
        placeholder="Senha"
        className="w-full rounded-lg border border-black/20 bg-transparent py-2 pl-3 pr-11 outline-none focus:border-black/60 dark:border-white/25 dark:focus:border-white/70"
      />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visivel}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center opacity-60 hover:opacity-100"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visivel ? <path d="M3 3l18 18" /> : null}
        </svg>
      </button>
    </div>
  );
}
