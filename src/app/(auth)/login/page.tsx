import Image from "next/image";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-hero">
        <Brand variant="logo" />
        <div>
          <p className="eyebrow">Internal operations</p>
          <h1>One place to keep every residence running.</h1>
          <p style={{ color: "#bbb7ae", maxWidth: 560 }}>
            Maintenance work, people and inventory — clear, secure and ready on any device.
          </p>
        </div>
        <div>
          <div className="corporate">
            <div>
              <span className="cap">Operated by</span>
              <strong>K HOTEL SDN BHD</strong>
            </div>
            <div>
              <span className="cap">A member of</span>
              <Image src="/kean-leng-group-logo.png" width={1024} height={390} alt="Kean Leng Group" />
            </div>
          </div>
          <p className="corporate-note">Authorised KLG personnel only.</p>
        </div>
      </section>
      <section className="login-form-wrap">
        <div className="panel login-panel">
          <p className="eyebrow">Welcome back</p>
          <h2>Sign in to KLGCR</h2>
          <p className="subtle">Use the access details supplied by your administrator.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
