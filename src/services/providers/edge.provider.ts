import { EdgeTTS } from "node-edge-tts";
import { Readable } from "stream";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { TTSOptions, Voice } from "../../interfaces/tts.interface";
import { log } from "../../utils/log";
import { streamChunksInOrder, splitTextIntoChunks } from "./stream-utils";

const EDGE_VOICES: Voice[] = [
  {
    ShortName: "vi-VN-HoaiMyNeural",
    Gender: "Female",
    Locale: "vi-VN",
    FriendlyName: "Microsoft HoaiMy - Tiếng Việt (Nữ)",
    Status: "GA",
    Provider: "edge",
  },
  {
    ShortName: "vi-VN-NamMinhNeural",
    Gender: "Male",
    Locale: "vi-VN",
    FriendlyName: "Microsoft NamMinh - Tiếng Việt (Nam)",
    Status: "GA",
    Provider: "edge",
  },
];

const DEFAULT_EDGE_VOICE = "vi-VN-HoaiMyNeural";
const EDGE_VOICE_SHORTNAMES = new Set(EDGE_VOICES.map((v) => v.ShortName));

export const isEdgeVoice = (voiceShortName?: string): boolean =>
  !!voiceShortName && EDGE_VOICE_SHORTNAMES.has(voiceShortName);

export const getVoices = async (): Promise<Voice[]> => {
  return EDGE_VOICES;
};

// node-edge-tts only exposes `ttsPromise(text, filePath)`, which writes a
// finished mp3 file once the whole chunk has been synthesized over a
// websocket - there's no built-in Readable/stream API. To still get the
// "stream chunk N to the client as soon as it's ready" behavior the rest of
// the app relies on, we synthesize each chunk into a unique temp file, read
// it back into a Buffer, and immediately delete the temp file.
const synthesizeChunkToBuffer = async (
  text: string,
  voiceShortName: string,
  chunkIndex: number,
  maxRetries: number = 2
): Promise<Buffer | null> => {
  const lang = voiceShortName.split("-").slice(0, 2).join("-") || "vi-VN";
  const tmpFile = path.join(os.tmpdir(), `edge-tts-${randomUUID()}.mp3`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.dev(
        `[EdgeTTS] Processing chunk ${chunkIndex + 1} (attempt ${attempt}) with voice ${voiceShortName}`
      );

      const tts = new EdgeTTS({
        voice: voiceShortName,
        lang,
        outputFormat: "audio-24khz-48kbitrate-mono-mp3",
        timeout: 15000,
      });

      await tts.ttsPromise(text, tmpFile);
      const buffer = await fs.readFile(tmpFile);

      if (buffer.byteLength > 0) {
        log.dev(
          `[EdgeTTS] Chunk ${chunkIndex + 1} processed successfully: ${buffer.byteLength} bytes`
        );
        return buffer;
      }

      log.dev(`[EdgeTTS] Chunk ${chunkIndex + 1} returned empty data`);
    } catch (error) {
      log.dev(
        `[EdgeTTS] Error processing chunk ${chunkIndex + 1} (attempt ${attempt}):`,
        error
      );

      if (attempt === maxRetries) {
        log.error(
          `[EdgeTTS] Failed to process chunk ${chunkIndex + 1} after ${maxRetries} attempts`
        );
        return null;
      }

      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    } finally {
      await fs.unlink(tmpFile).catch(() => {
        // temp file may not exist if synthesis failed before it was created
      });
    }
  }

  return null;
};

export const getTTSStream = async ({
  text,
  voiceShortName,
}: TTSOptions): Promise<Readable> => {
  const voice = isEdgeVoice(voiceShortName)
    ? (voiceShortName as string)
    : DEFAULT_EDGE_VOICE;

  log.info(`[EdgeTTS] Starting TTS streaming for ${text.length} chars using ${voice}`);

  const cleanText = text.replace(/\s+/g, " ").trim();
  if (!cleanText) {
    throw new Error("Text is empty or invalid");
  }

  // Edge TTS has no hard per-request character limit like Google's endpoint,
  // but very long single requests take longer to start streaming and are
  // more likely to hit the websocket timeout, so we still chunk - just with
  // much bigger pieces than the Google provider needs.
  const chunks = splitTextIntoChunks(cleanText, 1500);
  log.info(`[EdgeTTS] Split into ${chunks.length} chunks`);

  return streamChunksInOrder(
    chunks,
    (chunk, index) => synthesizeChunkToBuffer(chunk, voice, index),
    {
      concurrencyLimit: 2,
      batchDelayMs: 50,
      tag: "EdgeTTS",
    }
  );
};
