import Image from "next/image";
import type { Metadata } from "next";
import "./membership.css";
export const metadata: Metadata = { title: "Membership | KLG Campus Residence", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <main className="membership-public"><header className="membership-brand"><Image src="/klg-campus-residence-logo.png" width={380} height={127} alt="KLG Campus Residence" priority/><small>MEMBERSHIP SERVICES</small></header>{children}<footer>KLG Campus Residence Management · Your details are used to administer your membership.</footer></main>;
}
