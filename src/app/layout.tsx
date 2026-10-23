import type { Metadata, Viewport } from "next"; import "./globals.css"; import "./admin-polish.css"; import "./system-refinement.css";
export const metadata:Metadata={title:{default:"KLGCR Maintenance & Inventory",template:"%s | KLGCR"},description:"KLG Campus Residence internal maintenance and inventory system",manifest:"/manifest.webmanifest",icons:{icon:"/apple-touch-icon.png",apple:"/apple-touch-icon.png"},appleWebApp:{capable:true,statusBarStyle:"black-translucent",title:"KLGCR"}};
export const viewport: Viewport = { themeColor: "#0b0a07" };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
