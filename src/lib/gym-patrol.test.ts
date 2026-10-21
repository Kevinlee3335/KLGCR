import {describe,it,expect} from "vitest";
import {gymGroup,gymRouteAllowed,gymStatus} from "./gym-patrol";
import {roleHome} from "./types";
describe("Gym patrol",()=>{
 it("keeps the full expiry day active and expires the next day",()=>{
  expect(gymGroup({status:"active",expires_on:"2026-10-31"},"2026-10-31")).toBe("active");
  expect(gymGroup({status:"active",expires_on:"2026-10-31"},"2026-11-01")).toBe("expired");
  expect(gymStatus({status:"active",expires_on:"2026-10-31"},"2026-11-01")).toBe("Expired");
 });
 it("groups blocked members without labelling pending applicants active",()=>{
  for(const status of ["suspended","cancelled"]) expect(gymGroup({status,expires_on:"2026-12-31"},"2026-10-21")).toBe("blocked");
  expect(gymGroup({status:"pending",expires_on:null},"2026-10-21")).toBeNull();
  expect(gymStatus({status:"pending",expires_on:null},"2026-10-21")).toBe("Pending approval");
 });
 it("routes patrol users home and fences other modules including lookalike paths",()=>{
  expect(roleHome("gym_patrol")).toBe("/gym");
  for(const route of ["/gym","/gym/member","/account","/login"]) expect(gymRouteAllowed(route)).toBe(true);
  for(const route of ["/admin","/staff","/documents","/api/ai-assistant","/gym-admin"]) expect(gymRouteAllowed(route)).toBe(false);
 });
});
