export const metadata = { title: "Sem conexão" };

export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-16 text-center">
      <div className="text-5xl">📶</div>
      <h1 className="mt-3 text-xl font-bold">Sem conexão</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Esta página ainda não foi aberta neste aparelho com internet. As telas já visitadas (inventário, parto, sanidade,
        despesas…) funcionam offline e os lançamentos ficam guardados até o sinal voltar.
      </p>
      <a href="/" className="btn btn-primary mt-6">
        Tentar novamente
      </a>
    </main>
  );
}
