import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
export async function middleware(request:NextRequest){
  let response=NextResponse.next({request}); const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key) return response;
  const supabase=createServerClient(url,key,{cookies:{getAll:()=>request.cookies.getAll(),setAll(items){items.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});items.forEach(({name,value,options})=>response.cookies.set(name,value,options));}}});
  const {data:{user}}=await supabase.auth.getUser(); const protectedPath=request.nextUrl.pathname.startsWith("/admin")||request.nextUrl.pathname.startsWith("/staff");
  if(protectedPath&&!user){const login=request.nextUrl.clone();login.pathname="/login";login.searchParams.set("next",request.nextUrl.pathname);return NextResponse.redirect(login);}
  return response;
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]};
