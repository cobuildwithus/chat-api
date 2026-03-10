export const NOTIFICATION_KINDS = ["discussion", "payment", "protocol"] as const;

export const LIST_WALLET_NOTIFICATIONS_DEFAULT_LIMIT = 20;
export const LIST_WALLET_NOTIFICATIONS_LIMIT_MIN = 1;
export const LIST_WALLET_NOTIFICATIONS_LIMIT_MAX = 50;
export const LIST_WALLET_NOTIFICATIONS_CURSOR_MAX_LENGTH = 512;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type ListWalletNotificationsInput = {
  limit: number;
  cursor?: string;
  unreadOnly: boolean;
  kinds?: NotificationKind[];
};

export type WalletNotificationActor = {
  fid: number | null;
  walletAddress: string | null;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export type WalletNotificationSummary = {
  title: string | null;
  excerpt: string | null;
};

export type WalletNotificationResource = {
  sourceType: string;
  sourceId: string;
  sourceHash: string | null;
  rootHash: string | null;
  targetHash: string | null;
  appPath: string | null;
};

export type PaymentNotificationPayload = {
  amount: string | null;
};

export type WalletNotificationPayload = Record<string, unknown> | PaymentNotificationPayload | null;

export type WalletNotificationItem = {
  id: string;
  kind: string;
  reason: string;
  eventAt: string | null;
  createdAt: string;
  isUnread: boolean;
  actor: WalletNotificationActor | null;
  summary: WalletNotificationSummary;
  resource: WalletNotificationResource;
  payload: WalletNotificationPayload;
};

export type WalletNotificationsUnreadState = {
  count: number;
  watermark: string;
};

export type ListWalletNotificationsOutput = {
  subjectWalletAddress: string;
  items: WalletNotificationItem[];
  pageInfo: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
  unread: WalletNotificationsUnreadState;
};
