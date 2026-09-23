import type { Metadata } from "next"; import "./globals.css"; import "./admin-polish.css";
export const metadata:Metadata={title:{default:"KLGCR Maintenance & Inventory",template:"%s | KLGCR"},description:"KLG Campus Residence internal maintenance and inventory system",manifest:"/manifest.webmanifest",themeColor:"#0b0a07",icons:{icon:"/apple-touch-icon.png",apple:"/apple-touch-icon.png"},appleWebApp:{capable:true,statusBarStyle:"black-translucent",title:"KLGCR"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
