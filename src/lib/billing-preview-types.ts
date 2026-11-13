import type { BillingMailState } from "./billing-mail-settings";
import type { BillingConfig, BillingSnapshot } from "./billing-preview";

export type BillingOverview = {
  config: BillingConfig;
  photosLoaded: false;
  revision: number;
  clock: { date: string; time: string };
  pendingPackCount: number;
};

export type BillingRunSummary = {
  id: string;
  kind: BillingSnapshot["kind"];
  period: string;
  issue_date: string;
  total: number;
  verifiedCount: number;
  verifiedBy?: string[];
  approved: boolean;
  mail: BillingMailState | null;
};

export type BillingPack = BillingRunSummary & { snapshot: BillingSnapshot };

export type BillingMeterPhotosData = {
  accounts: {
    id: string;
    meters: { id: string; photo?: string; previousPhoto?: string }[];
  }[];
  period: string;
  revision: number;
};
