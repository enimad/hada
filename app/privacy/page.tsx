import Link from "next/link";
import { MobileScreen } from "@/components/mobile-screen";

export default function PrivacyPage() {
  return (
    <MobileScreen className="pb-12 pt-10">
      <section className="rounded-[32px] bg-white px-6 py-8 shadow-[0_18px_50px_rgba(46,28,54,0.08)]">
        <p className="text-[13px] font-semibold uppercase tracking-[0.28em] text-[var(--hada-coral)]">Confidentialité</p>
        <h1 className="mt-4 text-[34px] font-bold leading-[1] tracking-[-0.06em] text-[var(--hada-navy)]">
          Politique de confidentialité
        </h1>
        <div className="mt-8 space-y-5 text-[15px] leading-7 text-[#51475b]">
          <p>
            Hada accompagne les futurs mariés dans la recherche de prestataires de mariage. Nous collectons uniquement les informations nécessaires au fonctionnement du service.
          </p>
          <p>
            Les données traitées peuvent inclure votre adresse email, les informations de votre projet de mariage, vos échanges avec Hada et les prestataires enregistrés dans votre espace.
          </p>
          <p>
            Ces données servent à personnaliser l’expérience, sécuriser votre compte, générer des recommandations et préparer les prises de contact avec les prestataires.
          </p>
          <p>
            Vous pouvez demander l’accès, la correction ou la suppression de vos données en nous écrivant à l’adresse de support indiquée dans l’écran de consentement Google.
          </p>
        </div>
        <Link href="/" className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-[var(--hada-coral)] px-6 text-[15px] font-semibold text-white">
          Retour à l’accueil
        </Link>
      </section>
    </MobileScreen>
  );
}
