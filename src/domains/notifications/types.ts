export const NOTIFICATION_KINDS = ["discussion", "payment", "protocol"] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type WalletNotificationsCursor = {
  eventAt: string;
  createdAt: string;
  id: string;
};

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

export type WalletNotificationItem = {
  id: string;
  kind: NotificationKind;
  reason: string;
  eventAt: string;
  createdAt: string;
  isUnread: boolean;
  actor: WalletNotificationActor | null;
  summary: WalletNotificationSummary;
  resource: WalletNotificationResource;
  payload: Record<string, unknown> | null;
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
