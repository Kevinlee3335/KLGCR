import "./membership-receipt-sample.css";
export function MembershipReceiptSample(){
 return <figure className="membership-receipt-sample"><strong>Receipt sample</strong><a href="/payment-receipt-example.jpg" target="_blank" rel="noreferrer"><img src="/payment-receipt-example.jpg" alt="Sample bank transfer receipt for RM40 to K HOTEL SDN BHD, clearly marked as not a real transaction" width={640} height={960}/><span>Click to enlarge ↗</span></a><figcaption>For reference only. Upload your own genuine payment receipt. This sample is not proof of payment.</figcaption></figure>;
}
