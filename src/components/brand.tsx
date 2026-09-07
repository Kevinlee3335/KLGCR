import Image from "next/image";
// TODO: Replace with official KLG Campus Residence transparent PNG after the asset is added to the repository.
export function Brand(){return <div className="brand"><Image src="/klg-mark.svg" width={42} height={42} alt="KLG Campus Residence" priority/><div><strong>KLG CAMPUS RESIDENCE</strong><span>Operations Management System</span></div></div>}
