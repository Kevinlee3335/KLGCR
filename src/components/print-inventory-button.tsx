"use client";
import { Printer } from "lucide-react";
export function PrintInventoryButton(){return <button className="button secondary" type="button" onClick={()=>window.print()}><Printer size={15}/> Print / PDF</button>}
