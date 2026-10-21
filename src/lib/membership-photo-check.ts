"use client";

type Detection = {boundingBox?:{width:number;height:number};categories?:{score:number}[]};
type Detector = {detect:(image:HTMLCanvasElement)=>{detections:Detection[]}};
type VisionModule = {
 FilesetResolver:{forVisionTasks:(path:string)=>Promise<unknown>};
 FaceDetector:{createFromOptions:(files:unknown,options:unknown)=>Promise<Detector>};
};
let pending:Promise<Detector>|undefined;
async function detector(){
 if(!pending){
  const moduleUrl="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs";
  pending=(async()=>{
   const vision=await import(/* webpackIgnore: true */ moduleUrl) as VisionModule;
   const files=await vision.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm");
   return vision.FaceDetector.createFromOptions(files,{baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",delegate:"CPU"},runningMode:"IMAGE",minDetectionConfidence:0.7});
  })().catch(error=>{pending=undefined;throw error;});
 }
 return pending;
}
// Photo pixels stay in the browser. This checks presence, never identity or liveness.
export async function checkPersonalPhoto(canvas:HTMLCanvasElement):Promise<string|null>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 let model:Detector;
 try{
  model=await Promise.race([detector(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("timeout")),30000);})]);
 }catch{
  return "Photo check could not load. Check your connection, then select your photo again. Contact Management if this continues.";
 }finally{if(timer)clearTimeout(timer);}
 let faces:Detection[];
 try{faces=model.detect(canvas).detections;}catch{return "Photo check could not run. Try a JPG selfie or another browser.";}
 if(faces.length===0)return "No clear face found. Take a well-lit photo of your face, looking at the camera.";
 if(faces.length!==1)return "Please use a photo of yourself only. Group photos are not accepted.";
 const box=faces[0].boundingBox;
 if(!box || box.width<100 || box.height<100 || box.width<canvas.width*0.16 || box.height<canvas.height*0.16)return "Your face is too small in this photo. Move closer and retake it.";
 return null;
}
