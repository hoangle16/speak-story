export interface TTSOptions {
  text: string;
  voiceShortName?: string;
  rate?: number;
  pitch?: string;
}

export interface Voice {
  ShortName: string;
  Gender: string;
  Locale: string;
  FriendlyName: string;
  Status: string;
}