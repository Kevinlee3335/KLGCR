import { NextResponse } from "next/server";
import { membershipEnabled,membershipEmailConfigured } from "@/lib/membership";
export const dynamic="force-dynamic";
export async function GET() {
 return NextResponse.json({registrationEnabled:membershipEnabled(),emailConfigured:membershipEmailConfigured(),databaseConfigured:Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL)},{headers:{"Cache-Control":"no-store"}});
}
