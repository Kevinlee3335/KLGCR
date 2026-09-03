import Image from "next/image";

export function Brand({ variant = "compact" }: { variant?: "compact" | "logo" }) {
  if (variant === "logo") {
    return (
      <div className="brand brand-logo">
        <Image
          src="/klg-campus-residence-logo.png"
          width={1086}
          height={380}
          alt="KLG Campus Residence"
          priority
        />
      </div>
    );
  }
  return (
    <div className="brand">
      <Image src="/klg-campus-residence-logo.png" width={1086} height={380} alt="KLG Campus Residence" priority style={{ width: "auto", height: 40 }} />
    </div>
  );
}
