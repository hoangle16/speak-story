import axios from "axios";
import { Readable, PassThrough } from "stream";
import { Voice, TTSOptions } from "../interfaces/tts.interface";
import { log } from "../utils/log";

export const getVoices = async (): Promise<Voice[]> => {
  return [
    {
      ShortName: "vi-VN-GTTS-Female",
      Gender: "Female",
      Locale: "vi-VN",
      FriendlyName: "Google Text-to-Speech Vietnamese (Female)",
      Status: "GA",
    },
    {
      ShortName: "vi-VN-GTTS-Male",
      Gender: "Male",
      Locale: "vi-VN",
      FriendlyName: "Google Text-to-Speech Vietnamese (Male)",
      Status: "GA",
    },
  ];
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

const splitText = (text: string, maxLength: number = 100): string[] => {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];

  // Split by sentences first
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];

  let currentChunk = "";

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    // If adding this sentence would exceed the limit
    if ((currentChunk + " " + trimmedSentence).length > maxLength) {
      // Save current chunk if it has content
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }

      // If the sentence itself is too long, split by words
      if (trimmedSentence.length > maxLength) {
        const words = trimmedSentence.split(/\s+/);
        let wordChunk = "";

        for (const word of words) {
          if ((wordChunk + " " + word).length <= maxLength) {
            wordChunk += (wordChunk ? " " : "") + word;
          } else {
            if (wordChunk) {
              chunks.push(wordChunk);
              wordChunk = word;
            } else if (word.length <= maxLength) {
              chunks.push(word);
            } else {
              // Split very long words
              for (let i = 0; i < word.length; i += maxLength) {
                chunks.push(word.substring(i, i + maxLength));
              }
            }
          }
        }

        if (wordChunk) {
          currentChunk = wordChunk;
        }
      } else {
        currentChunk = trimmedSentence;
      }
    } else {
      currentChunk += (currentChunk ? " " : "") + trimmedSentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter((chunk) => chunk.trim().length > 0);
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
        `[GTTS] Processing chunk ${
          chunkIndex + 1
        }/${totalChunks} (attempt ${attempt})`
      );

      // Add delay between retries and requests to avoid rate limiting
      if (attempt > 1) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff
        log.dev(`[GTTS] Waiting ${delayMs}ms before retry...`);
        await delay(delayMs);
      }

      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 15000 + attempt * 5000, // Increase timeout with attempts
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
        validateStatus: (status) => status === 200, // Only accept 200 status
      });

      if (response.data && response.data.byteLength > 0) {
        log.dev(
          `[GTTS] Chunk ${chunkIndex + 1} processed successfully: ${
            response.data.byteLength
          } bytes`
        );
        return Buffer.from(response.data);
      } else {
        log.dev(`[GTTS] Chunk ${chunkIndex + 1} returned empty data`);
      }
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

      // If it's a 400 error, the text might be problematic - don't retry
      if (status === 400) {
        log.error(
          `[GTTS] Chunk ${chunkIndex + 1} has invalid text, skipping:`,
          chunk.substring(0, 100)
        );
        return null;
      }

      // If it's the last attempt, give up
      if (attempt === maxRetries) {
        log.error(
          `[GTTS] Failed to process chunk ${
            chunkIndex + 1
          } after ${maxRetries} attempts`
        );
        return null;
      }
    }
  }

  return null;
};

export const getTTSStream = async ({
  text,
  voiceShortName,
}: TTSOptions): Promise<Readable> => {
  log.info(
    `[GTTS] Starting TTS streaming for ${text.length} chars`
  );

  // Clean and prepare text
  const cleanText = text.replace(/\s+/g, " ").trim();
  if (!cleanText) {
    throw new Error("Text is empty or invalid");
  }

  const chunks = splitText(cleanText, 80); // Smaller chunks for better reliability
  log.info(
    `[GTTS] Split into ${chunks.length} chunks`
  );

  const outputStream = new PassThrough();
  let totalBytesStreamed = 0;
  let successfulChunks = 0;

  const processChunks = async () => {
    try {
      const concurrencyLimit = 2;
      const results: (Buffer | null)[] = new Array(chunks.length);
      let nextStreamIndex = 0;
      let hasStartedStreaming = false;

      // Store first chunk result when ready
      processChunkWithRetry(chunks[0], 0, chunks.length)
        .then((buffer) => {
          results[0] = buffer;
          streamReadyChunks();
        })
        .catch((error) => {
          log.error(`[GTTS] First chunk error:`, error);
          results[0] = null;
          streamReadyChunks();
        });

      // Function to stream chunks as soon as they're ready (in order)
      const streamReadyChunks = () => {
        while (
          nextStreamIndex < chunks.length &&
          results[nextStreamIndex] !== undefined
        ) {
          const buffer = results[nextStreamIndex];

          if (buffer && buffer.length > 0) {
            if (!hasStartedStreaming) {
              log.info(`[GTTS] Started streaming`);
              hasStartedStreaming = true;
            }

            outputStream.write(buffer);
            totalBytesStreamed += buffer.length;
            successfulChunks++;

            log.dev(
              `[GTTS] ⚡ Streamed chunk ${nextStreamIndex + 1}/${
                chunks.length
              } (${Math.round(totalBytesStreamed / 1024)}KB total)`
            );
          } else {
            log.dev(`[GTTS] ⏭️  Skipping failed chunk ${nextStreamIndex + 1}`);
          }

          nextStreamIndex++;
        }

        // Check if all chunks are processed
        if (nextStreamIndex >= chunks.length) {
          log.info(
            `[GTTS] Completed: ${Math.round(
              totalBytesStreamed / 1024
            )}KB from ${successfulChunks}/${chunks.length} chunks`
          );

          if (successfulChunks === 0) {
            throw new Error("No chunks were successfully processed");
          }

          outputStream.end();
        }
      };

      // Process remaining chunks (skip index 0 since it's already being processed)
      const processingPromises: Promise<void>[] = [];

      for (let i = 1; i < chunks.length; i += concurrencyLimit) {
        const batch = chunks.slice(
          i,
          Math.min(i + concurrencyLimit, chunks.length)
        );

        log.dev(
          `[GTTS] 🔄 Processing batch with chunks ${i + 1}-${Math.min(
            i + concurrencyLimit,
            chunks.length
          )}`
        );

        const batchPromises = batch.map((chunk, batchIndex) => {
          const actualIndex = i + batchIndex;

          return processChunkWithRetry(chunk, actualIndex, chunks.length)
            .then((buffer) => {
              results[actualIndex] = buffer;
              streamReadyChunks();
            })
            .catch((error) => {
              log.dev(
                `[GTTS] Chunk ${actualIndex + 1} processing failed:`,
                error
              );
              results[actualIndex] = null;
              streamReadyChunks();
            });
        });

        processingPromises.push(...batchPromises);

        // Add minimal delay between starting batches
        if (i + concurrencyLimit < chunks.length) {
          await delay(100);
        }
      }

      // Wait for all processing to complete
      await Promise.allSettled(processingPromises);

      // Final check to stream any remaining chunks
      streamReadyChunks();
    } catch (error) {
      log.error("[GTTS] Error during streaming process:", error);
      outputStream.emit(
        "error",
        new Error(
          `GTTS streaming failed: ${
            error instanceof Error ? error.message : error
          }`
        )
      );
    }
  };

  // Start processing
  processChunks().catch((error) => {
    log.error("[GTTS] Async processing error:", error);
    if (!outputStream.destroyed) {
      outputStream.emit("error", error);
    }
  });

  return outputStream;
};

// Utility function to test a single chunk
export const testChunk = async (text: string): Promise<boolean> => {
  try {
    const url = buildGoogleTTSUrl(text);
    log.dev(`[GTTS] Testing URL: ${url}`);

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "audio/mpeg, audio/*",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
        Referer: "https://translate.google.com/",
      },
    });

    log.info(`[GTTS] Test successful: ${response.data.byteLength} bytes`);
    return response.data.byteLength > 0;
  } catch (error) {
    const isAxiosError = axios.isAxiosError(error);
    log.error(
      `[GTTS] Test failed:`,
      isAxiosError
        ? `${error.response?.status} ${error.response?.statusText}`
        : error
    );
    return false;
  }
};
