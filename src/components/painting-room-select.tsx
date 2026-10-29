'use client';

import {useState} from 'react';

type RoomOption={id:string;label:string};
export function PaintingRoomSelect({rooms}:{rooms:RoomOption[]}){
 const [selected,setSelected]=useState<string[]>([]);
 return <div className="field field-wide"><label htmlFor="paint-rooms">Rooms (select one or more)</label><div className="painting-select-tools"><button type="button" className="button secondary" disabled={!rooms.length} onClick={()=>setSelected(rooms.map(r=>r.id))}>Select All</button><button type="button" className="button secondary" disabled={!selected.length} onClick={()=>setSelected([])}>Clear Selection</button><span className="subtle" role="status">{selected.length} / {rooms.length} selected</span></div><select id="paint-rooms" name="rooms" multiple size={8} required value={selected} onChange={event=>setSelected(Array.from(event.currentTarget.selectedOptions,option=>option.value))}>{rooms.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select><small>Use Select All to choose every room at once. Each room appears once. Workers inspect both the room and bathroom.</small></div>;
}
