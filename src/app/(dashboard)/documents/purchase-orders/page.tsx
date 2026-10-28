import {BusinessDocumentArchive} from '@/components/business-document-archive';
export default function Page({searchParams}:{searchParams:Promise<{q?:string;page?:string}>}){
 return <BusinessDocumentArchive kind="purchase-orders" searchParams={searchParams}/>;
}
