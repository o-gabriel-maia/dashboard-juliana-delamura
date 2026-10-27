import CampoSenha from "./CampoSenha";

export default async function Login({
  searchParams,
}: PageProps<"/login">) {
  const { erro } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <form
        method="POST"
        action="/api/login"
        className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 p-6 dark:border-white/15"
      >
        <div>
          <h1 className="text-lg font-semibold">Dashboard Juliana Delamura</h1>
          <p className="text-sm opacity-70">Digite o usuário e a senha para acessar.</p>
        </div>
        <input
          type="text"
          name="usuario"
          required
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          placeholder="Usuário"
          className="w-full rounded-lg border border-black/20 bg-transparent px-3 py-2 outline-none focus:border-black/60 dark:border-white/25 dark:focus:border-white/70"
        />
        <CampoSenha />
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" name="manter" className="h-4 w-4 cursor-pointer" />
          Me mantenha conectado
        </label>
        {erro ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            Usuário ou senha incorretos. Tente novamente.
          </p>
        ) : null}
        <button
          type="submit"
          className="w-full rounded-lg bg-black px-3 py-2 font-medium text-white dark:bg-white dark:text-black"
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
