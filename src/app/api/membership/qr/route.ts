import QRCode from "qrcode";
import { NextRequest, NextResponse } from "next/server";
import { appOrigin, membershipEnabled } from "@/lib/membership";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
 const card = request.nextUrl.searchParams.get("card");
 if (card && !membershipEnabled()) return new NextResponse("Not available", {status:404});
 if (card && !/^[a-f0-9-]{36}$/.test(card)) return new NextResponse("Invalid card", {status:400});
 const url = `${appOrigin()}/membership/${card ? `card/${card}` : "register"}`;
 const png = await QRCode.toBuffer(url,{type:"png",width:720,margin:4,errorCorrectionLevel:"M"});
 return new NextResponse(new Uint8Array(png),{headers:{"Content-Type":"image/png","Cache-Control":"public, max-age=3600",...(request.nextUrl.searchParams.has("download") ? {"Content-Disposition":'attachment; filename="KLGCR-membership-QR.png"'} : {})}});
}
