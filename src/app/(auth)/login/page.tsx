import Image from "next/image";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

function malaysiaDate() {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-MY", {
    weekday: "long",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(now);
  const date = new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(now);

  return { weekday, date };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ logout?: string }> }) {
  const today = malaysiaDate();
  const params = await searchParams;

  return (
    <main className="enterprise-login">
      <section className="login-story" aria-hidden="true" />

      <section className="login-access" aria-label="Account access">
        <div className="login-ambient login-ambient-one" />
        <div className="login-ambient login-ambient-two" />
        <div className="login-card">
          <div className="login-brand-panel">
            <Image
              className="login-residence-logo"
              src="/klg-campus-residence-logo.png"
              alt="KLG Campus Residence"
              width={560}
              height={186}
              priority
            />
          </div>

          <div className="login-operator">
            <span>Operated by</span>
            <strong>K Hotel Sdn. Bhd.</strong>
            <span>A Member of</span>
            <Image
              className="login-group-logo"
              src="/kean-leng-group-logo.png"
              alt="Kean Leng Group"
              width={360}
              height={121}
              priority
            />
          </div>

          <div className="login-card-heading">
            <p className="login-kicker">Welcome Back</p>
            <p>Please sign in using your company account.</p>
          </div>

          <LoginForm logoutRequested={params.logout === "1"} />

          <footer className="login-date" aria-label="Today in Malaysia">
            <span>{today.weekday}</span>
            <strong>{today.date}</strong>
            <span>Malaysia</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
