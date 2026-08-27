"use server";
import { redirect } from "next/navigation"; import { createClient } from "@/lib/supabase/server"; import { roleHome, type AppRole } from "@/lib/types";
export type LoginState={error?:string};
export async function login(_:LoginState,formData:FormData):Promise<LoginState>{
 const identifier=String(formData.get("identifier")??"").trim().toLowerCase(),password=String(formData.get("password")??"");
 if(!identifier||!password)return{error:"Enter your username or email and password."};
 const supabase=await createClient(); let email=identifier;
 if(!identifier.includes("@")){const {data,error}=await supabase.rpc("login_email_for_username",{login_username:identifier});if(error||!data)return{error:"Invalid username/email or password."};email=data;}
 const {error}=await supabase.auth.signInWithPassword({email,password});if(error)return{error:"Invalid username/email or password."};
 const {data:profile}=await supabase.from("profiles").select("role,is_active").single();
 if(!profile?.is_active){await supabase.auth.signOut();return{error:"This account is disabled. Contact an administrator."};}
 redirect(roleHome(profile.role as AppRole));
}
