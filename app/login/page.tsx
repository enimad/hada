import { Shell } from "@/components/shell";

export default function LoginPage() {
  return (
    <Shell
      title="Connexion"
      subtitle="Branche ensuite cette page sur Supabase Auth pour ouvrir une session utilisateur."
    >
      <form className="max-w-xl rounded-[28px] bg-white/85 p-8 shadow-card">
        <div className="grid gap-5">
          <label className="grid gap-2">
            <span className="text-sm">Email</span>
            <input className="rounded-2xl border border-black/10 px-4 py-3" placeholder="vous@exemple.com" />
          </label>
          <label className="grid gap-2">
            <span className="text-sm">Mot de passe</span>
            <input className="rounded-2xl border border-black/10 px-4 py-3" type="password" placeholder="********" />
          </label>
          <button type="button" className="rounded-full bg-ink px-6 py-3 text-sm text-white">
            Se connecter
          </button>
        </div>
      </form>
    </Shell>
  );
}
