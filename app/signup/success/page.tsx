import Link from "next/link";
import { HadaPortrait, HadaWordmark, MobileScreen } from "@/components/mobile-screen";

export default function SignupSuccessPage() {
  return (
    <MobileScreen className="pt-2">
      <div className="pt-8 text-center">
        <HadaWordmark className="mx-auto w-[270px]" />
        <p className="mt-5 text-[30px] font-semibold tracking-[-0.035em] text-[var(--hada-navy)]">
          Ton wedding planner de poche
        </p>
      </div>

      <div className="mt-10">
        <HadaPortrait variant="circle" className="w-[300px]" />
      </div>

      <div className="mt-14 text-center">
        <h1 className="text-[74px] font-bold tracking-[-0.07em] text-[var(--hada-navy)]">Félicitations !</h1>
        <p className="mt-2 text-[58px] font-bold leading-[1.04] tracking-[-0.06em] text-[var(--hada-coral)]">
          Vous-vous êtes dit oui.
        </p>
        <p className="mx-auto mt-16 max-w-[320px] text-[34px] font-medium leading-[1.35] tracking-[-0.04em] text-[#6d6767]">
          Le plus beau jour commence ici. J&apos;organise, vous profitez.
        </p>
      </div>

      <Link
        href="/onboarding"
        className="mt-24 flex h-[72px] w-full items-center justify-center rounded-full bg-[var(--hada-coral)] px-8 text-[28px] font-semibold tracking-[-0.03em] text-white shadow-[0_12px_34px_rgba(251,105,116,0.18)]"
      >
        On commence ?
      </Link>
    </MobileScreen>
  );
}
