import {describe,it,expect} from "vitest";
import {canCaptureUtilityPhotos,utilityPhotoData,UTILITY_PHOTO_STAFF_ID} from "./utility-photo-access";
import {defaultBillingConfig,type BillingConfig} from "./billing-preview";
import type {Profile} from "./types";
const profile:Profile={id:UTILITY_PHOTO_STAFF_ID,username:"faiz",full_name:"Faiz",role:"maintenance_staff",is_active:true};
function config():BillingConfig{return {...defaultBillingConfig,utilityAccounts:[{id:"emma-omar",seq:1,name:"Emma",addr:[],title:"",subsidy:0,cap:null,kind:"invoice",meters:[{id:"electric",label:"Electricity",serial:"E1",unit:"kWh",rate:.6,prev:10,curr:20,confirmed:true,role:"charge",previousPhoto:"data:image/jpeg;base64,YQ==",photo:"data:image/jpeg;base64,Yg=="}]}]}}
describe("Faiz Utilities photo access",()=>{
 it("allows only the active authorized maintenance account and admins",()=>{expect(canCaptureUtilityPhotos(profile)).toBe(true);expect(canCaptureUtilityPhotos({...profile,id:"someone-else"})).toBe(false);expect(canCaptureUtilityPhotos({...profile,is_active:false})).toBe(false);expect(canCaptureUtilityPhotos({...profile,role:"cleaner"})).toBe(false);expect(canCaptureUtilityPhotos(null)).toBe(false)});
 it("shares previous and current photos without exposing rental settings or rates",()=>{const view=utilityPhotoData(config(),9);expect(view.accounts[0].meters[0]).toMatchObject({photo:"data:image/jpeg;base64,Yg==",previousPhoto:"data:image/jpeg;base64,YQ==",curr:20,prev:10,confirmed:true});expect(view).not.toHaveProperty("tenants");expect(view.accounts[0].meters[0]).not.toHaveProperty("rate")});
});
