export const gymGroups = ["active", "expired", "blocked"] as const;
export type GymGroup = typeof gymGroups[number];
export function gymGroup(member:{status:string;expires_on:string|null},today:string):GymGroup|null {
 if(member.status==="active" && member.expires_on) return member.expires_on<today ? "expired" : "active";
 if(["suspended","cancelled"].includes(member.status)) return "blocked";
 return null;
}
export function gymStatus(member:{status:string;expires_on:string|null},today:string) {
 return member.status==="pending" ? "Pending approval" : gymGroup(member,today)==="expired" ? "Expired" : member.status.charAt(0).toUpperCase()+member.status.slice(1);
}
export function gymRouteAllowed(path:string) {
 return ["/gym","/account","/login","/auth"].some(prefix=>path===prefix||path.startsWith(prefix+"/"));
}
