import Image from "next/image";

type HadaPortraitProps = {
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: 84,
  md: 116,
  lg: 148
};

export function HadaPortrait({ size = "md" }: HadaPortraitProps) {
  const dimension = sizes[size];

  return (
    <div className="mx-auto inline-flex rounded-[28px] border border-[#f3e4df] bg-white p-2 shadow-[0_16px_38px_rgba(38,18,32,0.08)]">
      <div className="rounded-[22px] bg-[#fff5f2] p-2.5">
        <Image
          src="/hada-couple.svg"
          alt="Illustration Hada"
          width={dimension}
          height={dimension}
          className="h-auto w-auto"
          priority
        />
      </div>
    </div>
  );
}
