export type AppRole = "admin" | "maintenance_staff" | "management_viewer";
export type Profile = { id:string; username:string; full_name:string; role:AppRole; is_active:boolean; blocks?:{code:string;name:string}[] };
export const roleHome = (role: AppRole) => role === "admin" ? "/admin" : role === "maintenance_staff" ? "/staff" : "/admin";
export const roleLabel: Record<AppRole,string> = {admin:"Administrator",maintenance_staff:"Maintenance Staff",management_viewer:"Management Viewer"};
