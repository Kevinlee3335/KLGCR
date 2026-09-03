import type { Metadata } from "next"; import "./globals.css"; import "./admin-polish.css";
export const metadata:Metadata={title:{default:"KLGCR Maintenance & Inventory",template:"%s | KLGCR"},description:"KLG Campus Residence internal maintenance and inventory system"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
