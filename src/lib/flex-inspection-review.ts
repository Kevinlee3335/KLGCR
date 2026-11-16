export type FlexReviewer = "kevin" | "fikri";
export type FlexMailStatus = "pending" | "sending" | "sent" | "failed" | "uncertain";

export type FlexReview = {
  kevinVerifiedAt: string | null;
  fikriVerifiedAt: string | null;
  mailStatus: FlexMailStatus;
  sentAt: string | null;
  error: string | null;
};

export const emptyFlexReview: FlexReview = {
  kevinVerifiedAt: null,
  fikriVerifiedAt: null,
  mailStatus: "pending",
  sentAt: null,
  error: null,
};

export type FlexReviewResult =
  | { ok: true; review: FlexReview }
  | { ok: false; message: string };
