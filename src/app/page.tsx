import { redirect } from "next/navigation"; import { getSessionProfile } from "@/lib/auth"; import { roleHome } from "@/lib/types";
export default async function Home(){const profile=await getSessionProfile();redirect(profile?roleHome(profile.role):"/login");}
