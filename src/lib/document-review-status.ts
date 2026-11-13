export const documentReviewers=[
 {id:'a21286a7-56fd-48e4-9571-ffeacf825692',name:'Fikri',username:'fikri'},
 {id:'7a40e00f-2e95-4c27-83d9-0f7dba788b77',name:'Kevin',username:'kevinlee3335'},
 {id:'eeab5f04-30c3-42bd-a095-58e56c814358',name:'James',username:'james'}
] as const;

export const documentReviewStages = ['fikri', 'kevin', 'james'] as const;
export type DocumentReviewStage = typeof documentReviewStages[number];

export const documentReviewerForStage = {
 fikri: documentReviewers[0],
 kevin: documentReviewers[1],
 james: documentReviewers[2],
} as const;

export function documentReviewerStage(userId: string) {
 return documentReviewStages.find(stage => documentReviewerForStage[stage].id === userId);
}

export function canReviewDocumentStage(stage: string, reviewer: DocumentReviewStage | undefined) {
 return reviewer !== undefined && (stage === reviewer || (stage === 'verification' && reviewer !== 'james'));
}

export function documentVerificationSlots<T extends {user_id:string}>(entries: readonly T[]) {
 return [
  entries.find(entry => entry.user_id === documentReviewers[0].id),
  entries.find(entry => entry.user_id === documentReviewers[1].id),
 ] as const;
}

export function pendingDocumentReviewers(entries: readonly {user_id:string}[]) {
 const [fikri, kevin] = documentVerificationSlots(entries);
 if (fikri && kevin) return [documentReviewers[2]];
 return documentReviewers.slice(0, 2).filter((_, index) => index === 0 ? !fikri : !kevin);
}

export function documentReviewStatus(verifiedCount=0,approved=false,verifiedBy?:readonly string[]){
 if(approved)return 'Approved by James';
 if(verifiedBy){
  const pending=pendingDocumentReviewers(verifiedBy.map(user_id=>({user_id})));
  if(pending[0]===documentReviewers[2])return 'Pending James Approval';
  return 'Pending '+pending.map(reviewer=>reviewer.name).join(' and ')+' Verification';
 }
 if(verifiedCount>=2)return 'Pending James Approval';
 return verifiedCount===1?'Pending remaining verification':'Pending Fikri and Kevin Verification';
}

export function isDocumentReviewTarget(type: string, id: string): type is 'billing' | 'gym' {
 return (type === 'billing' || type === 'gym') && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
}
