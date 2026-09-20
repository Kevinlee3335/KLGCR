import Image from "next/image";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

const operations = [
  "Complaints",
  "Maintenance",
  "Inventory",
  "Reports",
  "Appointments",
  "Dashboard",
];

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

export default function LoginPage() {
  const today = malaysiaDate();

  return (
    <main className="enterprise-login">
      <section className="login-story" aria-labelledby="login-headline">
        <div className="residence-brand">
          <Image
            src="/klg-mark.svg"
            alt="KLG Campus Residence"
            width={64}
            height={64}
            priority
          />
        </div>

        <div className="login-story-copy">
          <p className="login-kicker"><span /> Internal Operations</p>
          <div className="login-system-name">
            <strong>KLG Campus Residence</strong>
            <span>Operations Management System</span>
          </div>
          <h1 id="login-headline">
            One place to manage<br />every maintenance operation.
          </h1>
          <ul className="login-capabilities" aria-label="Portal capabilities">
            {operations.map((operation) => <li key={operation}>{operation}</li>)}
          </ul>
        </div>

        <footer className="login-meta">
          <span>Version 1.0</span>
          <span>Authorized Personnel Only</span>
        </footer>
      </section>

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

          <LoginForm />

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
