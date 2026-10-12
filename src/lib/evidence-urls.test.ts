import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { signEvidencePhotos } from "./evidence-urls";

function client(sign: ReturnType<typeof vi.fn>, single = vi.fn()) {
  const from = vi.fn(() => ({ createSignedUrls: sign, createSignedUrl: single }));
  return { db: { storage: { from } } as unknown as Pick<SupabaseClient, "storage">, from };
}

describe("private evidence signing", () => {
  it("skips storage entirely when no evidence exists", async () => {
    const {db, from} = client(vi.fn());
    expect(await signEvidencePhotos(db, "private", [])).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("keeps duplicate rows and their order while signing each path once", async () => {
    const sign = vi.fn().mockResolvedValue({data:[
      {path:"b",signedUrl:"url-b",error:null}, {path:"a",signedUrl:"url-a",error:null},
    ],error:null});
    const {db,from} = client(sign);
    const photos = [{id:1,storage_path:"a"},{id:2,storage_path:"b"},{id:3,storage_path:"a"}];
    expect(await signEvidencePhotos(db, "private", photos)).toEqual([
      {...photos[0],url:"url-a",signError:false}, {...photos[1],url:"url-b",signError:false}, {...photos[2],url:"url-a",signError:false},
    ]);
    expect(from).toHaveBeenCalledWith("private");
    expect(sign).toHaveBeenCalledExactlyOnceWith(["a","b"],3600);
    expect(photos[0]).not.toHaveProperty("url");
  });

  it("preserves valid evidence when one file is missing", async () => {
    const {db} = client(vi.fn().mockResolvedValue({data:[
      {path:"missing",signedUrl:null,error:"not found"}, {path:"valid",signedUrl:"url",error:null},
    ],error:null}));
    expect(await signEvidencePhotos(db,"private",[{storage_path:"missing"},{storage_path:"valid"}])).toEqual([
      {storage_path:"missing",url:undefined,signError:true}, {storage_path:"valid",url:"url",signError:false},
    ]);
  });

  it("reduces 120 photo requests to two bounded batch requests", async () => {
    const sign = vi.fn(async (paths: string[]) => ({data:paths.map(path=>({path,signedUrl:`url-${path}`,error:null})),error:null}));
    const {db} = client(sign);
    const photos = Array.from({length:120},(_,id)=>({id,storage_path:String(id)}));
    const result = await signEvidencePhotos(db,"private",photos);
    expect(sign.mock.calls.map(([paths])=>paths.length)).toEqual([100,20]);
    expect(result.map(row=>row.id)).toEqual(photos.map(row=>row.id));
    expect(result.every(row=>!!row.url)).toBe(true);
  });

  it("falls back to single signing with at most four concurrent requests", async () => {
    let active = 0, peak = 0;
    const single = vi.fn(async (path: string) => {
      active++; peak=Math.max(peak,active);
      await Promise.resolve(); active--;
      return {data:{signedUrl:`url-${path}`},error:null};
    });
    const {db} = client(vi.fn().mockResolvedValue({data:null,error:{message:"batch unavailable"}}),single);
    const result=await signEvidencePhotos(db,"private",Array.from({length:12},(_,i)=>({storage_path:String(i)})));
    expect(single).toHaveBeenCalledTimes(12);
    expect(peak).toBeLessThanOrEqual(4);
    expect(result.every(row=>!row.signError)).toBe(true);
  });
});
