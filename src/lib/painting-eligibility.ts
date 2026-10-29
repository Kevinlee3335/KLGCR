// Painting work requires a recorded surface defect, not just any room defect.
export function isPaintingDefect(defect:{description:string;status:string}){
 if(defect.status!=='open')return false;
 return /\bpaint(?:ing)?\b|\bmou?ld(?:y)?\b|\b(?:wall|ceiling)\b.*(?:stain|dirty|peel|damp|water\s*mark|seepage)|(?:stain|dirty|peel|damp|water\s*mark|seepage).*\b(?:wall|ceiling)\b/i.test(defect.description);
}
