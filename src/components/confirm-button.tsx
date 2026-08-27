"use client";
export function ConfirmButton({children,message}:{children:string;message:string}){return <button className="button danger" type="submit" onClick={(event)=>{if(!window.confirm(message))event.preventDefault()}}>{children}</button>}
