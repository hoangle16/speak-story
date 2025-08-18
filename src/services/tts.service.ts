import axios from "axios";
import { Readable, PassThrough } from "stream";
import { Voice, TTSOptions } from "../interfaces/tts.interface";

// TODO: Get voices from Google TTS API
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
  const params = new URLSearchParams({
    ie: "UTF-8",
    q: text,
    tl: "vi",
    client: "tw-ob",
  });

  return `${baseUrl}?${params.toString()}`;
};

const splitText = (text: string, maxLength: number = 200): string[] => {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim());

  let currentChunk = "";

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    if ((currentChunk + trimmedSentence).length <= maxLength) {
      currentChunk += (currentChunk ? ". " : "") + trimmedSentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk + ".");
        currentChunk = trimmedSentence;
      } else {
        const words = trimmedSentence.split(" ");
        let wordChunk = "";

        for (const word of words) {
          if ((wordChunk + word).length <= maxLength) {
            wordChunk += (wordChunk ? " " : "") + word;
          } else {
            if (wordChunk) {
              chunks.push(wordChunk);
              wordChunk = word;
            }
          }
        }

        if (wordChunk) {
          currentChunk = wordChunk;
        }
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk + ".");
  }

  return chunks.filter((chunk) => chunk.trim());
};

const processChunkWithRetry = async (
  chunk: string,
  chunkIndex: number,
  totalChunks: number
): Promise<Buffer | null> => {
  const url = buildGoogleTTSUrl(chunk);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(
        `[GTTS] Processing chunk ${
          chunkIndex + 1
        }/${totalChunks} (attempt ${attempt})`
      );

      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: attempt === 1 ? 15000 : 20000,
        headers: {
          "User-Agent":
            attempt === 1
              ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
              : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "audio/mpeg, audio/*",
          "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
        },
      });

      if (response.data && response.data.byteLength > 0) {
        console.log(
          `[GTTS] Chunk ${chunkIndex + 1} processed successfully: ${
            response.data.byteLength
          } bytes`
        );
        return Buffer.from(response.data);
      } else {
        console.warn(
          `[GTTS] Chunk ${
            chunkIndex + 1
          } returned empty data (attempt ${attempt})`
        );
      }
    } catch (error) {
      console.error(
        `[GTTS] Error processing chunk ${chunkIndex + 1} (attempt ${attempt}):`,
        error
      );

      if (attempt < 2) {
        // wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  return null;
};

export const getTTSStream = async ({
  text,
  voiceShortName,
}: TTSOptions): Promise<Readable> => {
  console.log(
    `[GTTS] Starting real-time streaming for text length: ${text.length} characters`
  );

  const chunks = splitText(text, 200);
  console.log(`[GTTS] Split into ${chunks.length} chunks for streaming`);

  // Create PassThrough stream to write data immediately when available
  const outputStream = new PassThrough();
  let hasStartedStreaming = false;
  let totalBytesStreamed = 0;

  // process chunks in parallel but stream in order
  const processChunks = async () => {
    try {
      // create array to save promises and results
      const chunkPromises: Promise<{ index: number; buffer: Buffer | null }>[] =
        [];
      const chunkResults: (Buffer | null)[] = new Array(chunks.length);
      let processedCount = 0;
      let streamedCount = 0;

      // start processing all chunks in parallel (but limit concurrency)
      const concurrencyLimit = 3; // limit 3 concurrent requests to avoid rate limit

      for (let i = 0; i < chunks.length; i += concurrencyLimit) {
        const batch = chunks.slice(
          i,
          Math.min(i + concurrencyLimit, chunks.length)
        );

        const batchPromises = batch.map((chunk, batchIndex) => {
          const actualIndex = i + batchIndex;
          return processChunkWithRetry(
            chunk,
            actualIndex,
            chunks.length
          ).then((buffer) => ({ index: actualIndex, buffer }));
        });

        // wait for batch to finish
        const batchResults = await Promise.allSettled(batchPromises);

        // save results
        batchResults.forEach((result, batchIndex) => {
          const actualIndex = i + batchIndex;
          if (result.status === "fulfilled") {
            chunkResults[actualIndex] = result.value.buffer;
            processedCount++;

            // stream chunks that are ready (in order)
            while (
              streamedCount < processedCount &&
              streamedCount < chunks.length
            ) {
              const bufferToStream = chunkResults[streamedCount];

              if (bufferToStream) {
                if (!hasStartedStreaming) {
                  console.log(`[GTTS] Starting to stream first chunk...`);
                  hasStartedStreaming = true;
                }

                outputStream.write(bufferToStream);
                totalBytesStreamed += bufferToStream.length;

                // Log progress
                if (totalBytesStreamed % (50 * 1024) < bufferToStream.length) {
                  console.log(
                    `[GTTS] Streamed chunk ${streamedCount + 1}/${
                      chunks.length
                    }: ${Math.round(totalBytesStreamed / 1024)}KB total`
                  );
                }
              } else {
                console.warn(
                  `[GTTS] Chunk ${
                    streamedCount + 1
                  } failed, streaming silence/skip`
                );
              }

              streamedCount++;
            }
          } else {
            console.error(
              `[GTTS] Batch processing failed for index ${actualIndex}:`,
              result.reason
            );
            chunkResults[actualIndex] = null;
            processedCount++;
          }
        });

        // small delay between batches to avoid rate limit
        if (i + concurrencyLimit < chunks.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // stream last chunks if any
      while (streamedCount < chunks.length) {
        const bufferToStream = chunkResults[streamedCount];
        if (bufferToStream) {
          outputStream.write(bufferToStream);
          totalBytesStreamed += bufferToStream.length;
        }
        streamedCount++;
      }

      console.log(
        `[GTTS] Streaming completed. Total: ${Math.round(
          totalBytesStreamed / 1024
        )}KB`
      );
      outputStream.end();
    } catch (error) {
      console.error("[GTTS] Error during streaming process:", error);
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

  // start processing chunks in background
  processChunks().catch((error) => {
    console.error("[GTTS] Async processing error:", error);
    outputStream.emit("error", error);
  });

  return outputStream;
};
