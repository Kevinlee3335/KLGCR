export function paintingArea(description:string){return /\bbathroom\b/i.test(description)?'Bathroom':/\broom\b/i.test(description)?'Room':'Other';}
export function isPaintingDefect(description:string){
 return /\b(paint(?:ing)?|repaint(?:ing)?|mou?ldy|mou?ld)\b/i.test(description)||(/\b(wall|ceiling)\b/i.test(description)&&/\b(stain(?:ed)?|dirty|water\s*mark|discolou?r(?:ed|ation)?)\b/i.test(description));
}
