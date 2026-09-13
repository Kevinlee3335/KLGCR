export const checkoutStatuses = ["second_inspection", "rectification", "cleaning", "verification", "ready_for_occupancy"] as const;
export type CheckoutStatus = typeof checkoutStatuses[number];
export const checkoutStatusLabel: Record<CheckoutStatus,string> = {second_inspection:"Second inspection",rectification:"Rectification",cleaning:"Cleaning",verification:"Admin verification",ready_for_occupancy:"Ready for Occupancy"};
export type CheckoutRoom = {id:string;reference_no:string;room_no:string;utmspace_defects:string;inspection_notes:string|null;status:CheckoutStatus;assigned_to:string|null;cleaner_id:string|null;created_at:string;ready_at:string|null;block:{code:string}|null;assignee:{full_name:string}|null;cleaner:{full_name:string}|null};
