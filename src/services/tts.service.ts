import { Readable } from "stream";
import { TTSOptions, TTSProviderName, Voice } from "../interfaces/tts.interface";
import * as googleProvider from "./providers/google.provider";
import * as edgeProvider from "./providers/edge.provider";

// Picks a provider for requests that don't explicitly say which one to use
// (e.g. old clients, or the prefetch/auto-next-chapter flow that just
// forwards whatever voiceShortName the user picked earlier). Edge voices all
// follow Microsoft's "<locale>-<Name>Neural" naming, so we can tell them
// apart from the Google ones reliably.
const resolveProvider = (voiceShortName?: string): TTSProviderName => {
  if (edgeProvider.isEdgeVoice(voiceShortName)) {
    return "edge";
  }
  return "google";
};

export const getVoices = async (): Promise<Voice[]> => {
  const [googleVoices, edgeVoices] = await Promise.all([
    googleProvider.getVoices(),
    edgeProvider.getVoices(),
  ]);

  return [...googleVoices, ...edgeVoices];
};

export const getTTSStream = async (options: TTSOptions): Promise<Readable> => {
  const provider = options.provider ?? resolveProvider(options.voiceShortName);

  if (provider === "edge") {
    return edgeProvider.getTTSStream(options);
  }

  return googleProvider.getTTSStream(options);
};
