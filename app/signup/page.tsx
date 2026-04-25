import { Shell } from "@/components/shell";

export default function SignupPage() {
  return (
    <Shell
      title="Inscription"
      subtitle="Cette etape cree le compte puis lance l'onboarding pour remplir les informations essentielles du mariage."
    >
      <form className="max-w-2xl rounded-[28px] bg-white/85 p-8 shadow-card">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm">Prenom</span>
            <input className="rounded-2xl border border-black/10 px-4 py-3" placeholder="Lea" />
          </label>
          <label className="grid gap-2">
            <span className="text-sm">Nom</span>
            <input className="rounded-2xl border border-black/10 px-4 py-3" placeholder="Martin" />
          </label>
          <label className="grid gap-2 md:col-span-2">
            <span className="text-sm">Email</span>
            <input className="rounded-2xl border border-black/10 px-4 py-3" placeholder="lea@example.com" />
          </label>
          <label className="grid gap-2 md:col-span-2">
            <span className="text-sm">Mot de passe</span>
            <input className="rounded-2xl border border-black/10 px-4 py-3" type="password" placeholder="********" />
          </label>
        </div>
        <button type="button" className="mt-6 rounded-full bg-ink px-6 py-3 text-sm text-white">
          Creer mon compte
        </button>
      </form>
    </Shell>
  );
}
