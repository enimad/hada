import Link from "next/link";
import { MobileScreen } from "@/components/mobile-screen";

export default function TermsPage() {
  return (
    <MobileScreen className="pb-12 pt-10">
      <section className="rounded-[32px] bg-white px-6 py-8 shadow-[0_18px_50px_rgba(46,28,54,0.08)]">
        <p className="text-[13px] font-semibold uppercase tracking-[0.28em] text-[var(--hada-coral)]">Conditions</p>
        <h1 className="mt-4 text-[34px] font-bold leading-[1] tracking-[-0.06em] text-[var(--hada-navy)]">
          Conditions d&apos;utilisation
        </h1>
        <div className="mt-8 space-y-5 text-[15px] leading-7 text-[#51475b]">
          <p>
            Hada est une webapp en version bêta destinée à aider les couples à identifier, comparer et contacter des prestataires de mariage.
          </p>
          <p>
            Les recommandations sont fournies à titre d’aide à la décision. L’utilisateur reste responsable de vérifier les informations, disponibilités, tarifs et conditions auprès des prestataires.
          </p>
          <p>
            Certaines fonctionnalités peuvent évoluer pendant la bêta. Nous faisons le maximum pour proposer une expérience fiable, claire et utile.
          </p>
          <p>
            En utilisant Hada, vous acceptez une utilisation raisonnable du service et vous vous engagez à ne pas détourner les fonctionnalités de leur objectif initial.
          </p>
        </div>
        <Link href="/" className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-[var(--hada-coral)] px-6 text-[15px] font-semibold text-white">
          Retour à l’accueil
        </Link>
      </section>
    </MobileScreen>
  );
}
