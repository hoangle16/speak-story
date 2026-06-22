import axios from "axios";
import { Readable } from "stream";
import { TTSOptions, Voice } from "../../interfaces/tts.interface";
import { log } from "../../utils/log";
import { streamChunksInOrder, splitTextIntoChunks } from "./stream-utils";

// NOTE: Google Translate's "translate_tts" endpoint is an unofficial, reverse
// engineered API (not the real Google Cloud TTS). It only exposes a single,
// generic voice per language — there is no actual male/female distinction.
// The previous version of this provider exposed two fake voices
// ("vi-VN-GTTS-Female" / "vi-VN-GTTS-Male") that both produced the exact same
// audio under the hood, which was misleading. We now expose just the one
// real voice that exists.
const GOOGLE_VI_VOICE: Voice = {
  ShortName: "vi-VN-GTTS-Standard",
  Gender: "Neutral",
  Locale: "vi-VN",
  FriendlyName: "Google Translate TTS - Tiếng Việt",
  Status: "GA",
  Provider: "google",
};

export const getVoices = async (): Promise<Voice[]> => {
  return [GOOGLE_VI_VOICE];
};

const buildGoogleTTSUrl = (text: string): string => {
  const baseUrl = "https://translate.google.com/translate_tts";

  // Ensure text is properly encoded and not too long
  const cleanText = text.trim().substring(0, 200);

  const params = new URLSearchParams({
    ie: "UTF-8",
    q: cleanText,
    tl: "vi",
    client: "tw-ob",
    textlen: cleanText.length.toString(),
  });

  return `${baseUrl}?${params.toString()}`;
};

const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const processChunkWithRetry = async (
  chunk: string,
  chunkIndex: number,
  totalChunks: number,
  maxRetries: number = 3
): Promise<Buffer | null> => {
  const url = buildGoogleTTSUrl(chunk);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.dev(
        `[GTTS] Processing chunk ${chunkIndex + 1}/${totalChunks} (attempt ${attempt})`
      );

      if (attempt > 1) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        log.dev(`[GTTS] Waiting ${delayMs}ms before retry...`);
        await delay(delayMs);
      }

      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 15000 + attempt * 5000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "audio/mpeg, audio/*, */*",
          "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          Referer: "https://translate.google.com/",
        },
        validateStatus: (status) => status === 200,
      });

      if (response.data && response.data.byteLength > 0) {
        log.dev(
          `[GTTS] Chunk ${chunkIndex + 1} processed successfully: ${response.data.byteLength} bytes`
        );
        return Buffer.from(response.data);
      }

      log.dev(`[GTTS] Chunk ${chunkIndex + 1} returned empty data`);
    } catch (error) {
      const isAxiosError = axios.isAxiosError(error);
      const status = isAxiosError ? error.response?.status : "unknown";
      const statusText = isAxiosError ? error.response?.statusText : "unknown";

      log.dev(
        `[GTTS] Error processing chunk ${chunkIndex + 1} (attempt ${attempt}):`,
        `Status: ${status} ${statusText}`,
        isAxiosError && error.response?.data
          ? `Response: ${error.response.data.toString().substring(0, 200)}`
          : error
      );

      if (status === 400) {
        log.error(
          `[GTTS] Chunk ${chunkIndex + 1} has invalid text, skipping:`,
          chunk.substring(0, 100)
        );
        return null;
      }

      if (attempt === maxRetries) {
        log.error(
          `[GTTS] Failed to process chunk ${chunkIndex + 1} after ${maxRetries} attempts`
        );
        return null;
      }
    }
  }

  return null;
};

export const getTTSStream = async ({ text }: TTSOptions): Promise<Readable> => {
  log.info(`[GTTS] Starting TTS streaming for ${text.length} chars`);

  const cleanText = text.replace(/\s+/g, " ").trim();
  if (!cleanText) {
    throw new Error("Text is empty or invalid");
  }

  // Google's endpoint has a hard ~200 char limit per request, so chunks must
  // stay small.
  const chunks = splitTextIntoChunks(cleanText, 80);
  log.info(`[GTTS] Split into ${chunks.length} chunks`);

  return streamChunksInOrder(chunks, processChunkWithRetry, {
    concurrencyLimit: 2,
    batchDelayMs: 100,
    tag: "GTTS",
  });
};
