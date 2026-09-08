export const roomAccessOptions = ["resident_present","enter_with_permission","call_before_entering","key_at_office","need_appointment","no_access"] as const;
export const appointmentStatuses = ["pending_confirmation","confirmed","completed","cancelled","rescheduled","no_show"] as const;
export const titleCase = (value:string) => value.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());
