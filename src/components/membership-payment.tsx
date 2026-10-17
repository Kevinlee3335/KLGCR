import Image from "next/image";
import { Download, ScanLine, UploadCloud } from "lucide-react";
export function MembershipPayment({amount}:{amount:number}) {
 return <section className="wide membership-payment" aria-label="Membership payment QR code">
  <div className="payment-copy"><span className="payment-step"><ScanLine size={16} aria-hidden="true"/> STEP 1 · MAKE PAYMENT</span><h3>Scan to pay</h3><p>Pay the amount below using this DuitNow QR.</p><div className="payment-amount"><span>Amount to pay</span><strong>RM{amount.toFixed(2)}</strong></div><dl className="payment-recipient"><div><dt>Recipient</dt><dd>K HOTEL SDN BHD</dd></div><div><dt>Payment provider</dt><dd>Alliance Bank · DuitNow QR</dd></div></dl><p className="payment-help">Confirm the recipient and amount in your banking app before paying.</p><span className="payment-step"><UploadCloud size={16} aria-hidden="true"/> STEP 2 · UPLOAD PAYMENT RECEIPT</span><p>After payment, upload your receipt or payment screenshot below.</p></div>
  <div className="payment-qr-card"><span className="duitnow-label">DuitNow QR</span><Image src="/membership-payment-qr.svg" width={320} height={320} unoptimized alt="DuitNow payment QR for K HOTEL SDN BHD"/><strong>K HOTEL SDN BHD</strong><a className="payment-download" href="/membership-payment-qr.png" download="KLGCR-payment-QR.png"><Download size={16} aria-hidden="true"/> Save payment QR</a><small>Using one phone? Save this QR image to use in your banking app.</small></div>
 </section>;
}
