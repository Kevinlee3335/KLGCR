import type { Metadata } from "next";
import "./membership.css";
export const metadata: Metadata = { title: "Membership | KLG Campus Residence", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <main className="membership-public"><header className="membership-brand"><span>KLG</span><div><strong>CAMPUS RESIDENCE</strong><small>Membership services</small></div></header>{children}<footer>KLG Campus Residence Management · Your details are used to administer your membership.</footer></main>;
}
