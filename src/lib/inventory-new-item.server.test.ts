// @vitest-environment node
import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertNumberedInventoryItem } from "./inventory-new-item.server";

function database(codes: string[]) {
  const insert = vi.fn().mockResolvedValue({error:null});
  const read = vi.fn(async (from: number, to: number) => ({data:codes.slice(from,to+1).map(item_code=>({item_code})),error:null}));
  const q = {select:()=>q,or:()=>q,order:()=>q,range:read,insert};
  return {client:{from:()=>q} as unknown as Pick<SupabaseClient,"from">,insert,read};
}

it("reads past the API page limit and ignores a stale supplied item code",async()=>{
  const db=database([...Array.from({length:1000},(_,i)=>`KLGCR-B${String(i+1).padStart(5,"0")}`),"B02009"]);
  const result=await insertNumberedInventoryItem(db.client,{category:"Building",item_code:"KLGCR-B00001",description:"New window handle"});
  expect(result).toEqual({itemCode:"KLGCR-B02010",error:null});
  expect(db.read).toHaveBeenCalledWith(1000,1999);
  expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({item_code:"KLGCR-B02010"}));
});

it("refreshes and retries when another administrator claims the previewed code",async()=>{
  const codes=["KLGCR-PG00097"];
  const db=database(codes);
  db.insert.mockImplementationOnce(async()=>{codes.push("KLGCR-PG00098");return {error:{code:"23505",message:"duplicate item code"}};});
  expect(await insertNumberedInventoryItem(db.client,{category:"Piping"})).toEqual({itemCode:"KLGCR-PG00099",error:null});
  expect(db.insert).toHaveBeenCalledTimes(2);
});

it("does not retry permission errors or insert after a failed catalog read",async()=>{
  const db=database([]);
  db.insert.mockResolvedValue({error:{code:"42501",message:"Permission denied"}});
  expect((await insertNumberedInventoryItem(db.client,{category:"Building"})).error?.message).toBe("Permission denied");
  expect(db.insert).toHaveBeenCalledTimes(1);
  db.insert.mockClear();
  db.read.mockResolvedValue({data:[],error:{message:"Read failed"}} as never);
  expect((await insertNumberedInventoryItem(db.client,{category:"Building"})).error?.message).toBe("Read failed");
  expect(db.insert).not.toHaveBeenCalled();
});
