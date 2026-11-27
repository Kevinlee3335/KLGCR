"use client";

import { Suspense, use } from "react";

type Block = { id: number; code: string };
export type BlockChoices = Block[] | Promise<Block[] | null>;

type Props = { source: BlockChoices; defaultId?: number; disablePlaceholder?: boolean };
function BlockSelect({ source, defaultId, disablePlaceholder }: Props) {
  const rows = Array.isArray(source) ? source : use(source);
  return <select name="blockId" required defaultValue={defaultId ?? ""}>
    <option value="" disabled={disablePlaceholder}>{rows ? "Choose block" : "Unable to load blocks. Please refresh."}</option>
    {rows?.map(block => <option key={block.id} value={block.id}>Block {block.code}</option>)}
  </select>;
}

export function ComplaintBlockSelect(props: Props) {
  return <Suspense fallback={<select name="blockId" required defaultValue="" aria-busy="true"><option value="">Loading blocks…</option></select>}>
    <BlockSelect {...props}/>
  </Suspense>;
}
