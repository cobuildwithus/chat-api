export type SubjectWallet = `0x${string}`;

export type ChatUser = {
  address: SubjectWallet;
  country: string | null;
  countryRegion: string | null;
  city: string | null;
  userAgent: string | null;
};
