export type TTSProviderName = "google" | "edge";

export interface TTSOptions {
  text: string;
  voiceShortName?: string;
  provider?: TTSProviderName;
  rate?: number;
  pitch?: string;
}

export interface Voice {
  ShortName: string;
  Gender: string;
  Locale: string;
  FriendlyName: string;
  Status: string;
  Provider: TTSProviderName;
}
