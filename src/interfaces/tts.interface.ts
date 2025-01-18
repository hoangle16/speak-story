import { PITCH, RATE, VOLUME } from "edge-tts-node";

export interface TTSOptions {
  text: string;
  voiceShortName?: string;
  rate?: number | RATE;
  pitch?: string | PITCH;
  volume?: number | VOLUME;
}