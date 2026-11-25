export const gymDepositStartDate = '2026-12-01';

export function newGymDepositsAvailable(now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  return day >= gymDepositStartDate;
}
