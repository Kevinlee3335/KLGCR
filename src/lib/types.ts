export type AppRole = "admin" | "maintenance_staff" | "cleaner" | "management_viewer" | "gym_patrol";
export type Profile = { id:string; username:string; full_name:string; role:AppRole; is_active:boolean; blocks?:{code:string;name:string}[] };
export const roleHome = (role: AppRole) => role === "gym_patrol" ? "/gym" : role === "admin" ? "/admin" : role === "cleaner" ? "/staff" : role === "maintenance_staff" ? "/staff" : "/admin";
export const roleLabel: Record<AppRole,string> = {gym_patrol:"Gym Patrol (Read only)",admin:"Administrator",maintenance_staff:"Maintenance Staff",cleaner:"Cleaner / Housekeeping",management_viewer:"Management Viewer"};
