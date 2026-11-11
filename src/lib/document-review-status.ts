export const documentReviewers=[
 {id:'a21286a7-56fd-48e4-9571-ffeacf825692',name:'Fikri',username:'fikri'},
 {id:'7a40e00f-2e95-4c27-83d9-0f7dba788b77',name:'Kevin',username:'kevinlee3335'},
 {id:'eeab5f04-30c3-42bd-a095-58e56c814358',name:'James',username:'james'}
] as const;

export function documentReviewStatus(verifiedCount=0,approved=false){
 if(approved)return 'Approved by James';
 return ['Pending Fikri Verification','Pending Kevin Verification','Pending James Approval'][Math.min(2,Math.max(0,verifiedCount))];
}

export function isDocumentReviewTarget(type: string, id: string): type is 'billing' | 'gym' {
 return (type === 'billing' || type === 'gym') && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
}
