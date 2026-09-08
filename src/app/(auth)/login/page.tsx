import Image from "next/image";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="enterprise-login">
      <section className="login-story" aria-labelledby="login-headline">
        <div className="residence-brand">
          <Image src="/klg-mark.svg" alt="" width={54} height={54} priority />
          <div>
            <strong>KLG Campus Residence</strong>
            <span>Maintenance &amp; Operations</span>
          </div>
        </div>

        <div className="login-story-copy">
          <p className="login-kicker"><span /> Operations Management System</p>
          <h1 id="login-headline">One place to keep every residence running.</h1>
          <p>
            A unified workspace for maintenance, people, and inventory—built to
            keep every team aligned and every residence operating at its best.
          </p>
        </div>

        <footer className="login-company">
          <strong>K Hotel Sdn Bhd</strong>
          <span>A member of Kean Leng Group</span>
        </footer>
      </section>

      <section className="login-access" aria-label="Account access">
        <div className="login-ambient login-ambient-one" />
        <div className="login-ambient login-ambient-two" />
        <div className="login-card">
          <div className="group-logo">
            <Image
              src="/klg-logo.svg"
              alt="Kean Leng Group"
              width={180}
              height={60}
              priority
            />
          </div>
          <div className="login-card-heading">
            <p className="login-kicker">Secure account access</p>
            <h2>Welcome Back</h2>
            <p>Enter your credentials to access the operations portal.</p>
          </div>
          <LoginForm />
          <div className="login-security">
            <span aria-hidden="true" />
            Protected access for authorised personnel only
          </div>
        </div>
        <p className="login-help">Need help accessing your account? <strong>Contact your administrator</strong></p>
      </section>
    </main>
  );
}
