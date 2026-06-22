import { PassThrough } from "stream";
import { log } from "../../utils/log";

export type ChunkProcessor = (
  chunk: string,
  index: number,
  total: number
) => Promise<Buffer | null>;

interface StreamChunksOptions {
  concurrencyLimit?: number;
  batchDelayMs?: number;
  tag?: string;
}

/**
 * Generic helper that takes an array of text chunks plus a per-chunk
 * "processor" function and streams the resulting audio buffers to a
 * PassThrough stream IN ORDER, as soon as each chunk is ready - while still
 * processing several chunks concurrently in the background.
 *
 * This is the same "process out-of-order, stream in-order" strategy that the
 * Google TTS implementation used, just extracted so any TTS provider
 * (Google, Edge, future ones) can reuse it instead of re-implementing the
 * concurrency/ordering/retry-skip logic every time.
 */
export const streamChunksInOrder = (
  chunks: string[],
  processChunk: ChunkProcessor,
  options: StreamChunksOptions = {}
): PassThrough => {
  const { concurrencyLimit = 2, batchDelayMs = 100, tag = "TTS" } = options;

  const outputStream = new PassThrough();
  const results: (Buffer | null)[] = new Array(chunks.length);
  let nextStreamIndex = 0;
  let totalBytesStreamed = 0;
  let successfulChunks = 0;

  const streamReadyChunks = () => {
    while (
      nextStreamIndex < chunks.length &&
      results[nextStreamIndex] !== undefined
    ) {
      const buffer = results[nextStreamIndex];

      if (buffer && buffer.length > 0) {
        outputStream.write(buffer);
        totalBytesStreamed += buffer.length;
        successfulChunks++;
        log.dev(
          `[${tag}] ⚡ Streamed chunk ${nextStreamIndex + 1}/${chunks.length} (${Math.round(
            totalBytesStreamed / 1024
          )}KB total)`
        );
      } else {
        log.dev(`[${tag}] ⏭️  Skipping failed chunk ${nextStreamIndex + 1}`);
      }

      nextStreamIndex++;
    }

    if (nextStreamIndex >= chunks.length) {
      if (successfulChunks === 0) {
        outputStream.emit(
          "error",
          new Error(`[${tag}] No chunks were successfully processed`)
        );
        return;
      }
      log.info(
        `[${tag}] Completed: ${Math.round(
          totalBytesStreamed / 1024
        )}KB from ${successfulChunks}/${chunks.length} chunks`
      );
      outputStream.end();
    }
  };

  const run = async () => {
    try {
      const settle = (index: number, buffer: Buffer | null) => {
        results[index] = buffer;
        streamReadyChunks();
      };

      const allTasks: Promise<void>[] = [];

      for (let i = 0; i < chunks.length; i += concurrencyLimit) {
        const batch = chunks.slice(i, i + concurrencyLimit);

        const batchTasks = batch.map((chunk, batchIndex) => {
          const index = i + batchIndex;
          return processChunk(chunk, index, chunks.length)
            .then((buffer) => settle(index, buffer))
            .catch((err) => {
              log.error(`[${tag}] Chunk ${index + 1} processing failed:`, err);
              settle(index, null);
            });
        });

        allTasks.push(...batchTasks);

        if (i + concurrencyLimit < chunks.length && batchDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
        }
      }

      await Promise.allSettled(allTasks);
      streamReadyChunks();
    } catch (err) {
      log.error(`[${tag}] Error during streaming process:`, err);
      outputStream.emit(
        "error",
        new Error(
          `${tag} streaming failed: ${err instanceof Error ? err.message : err}`
        )
      );
    }
  };

  run().catch((err) => {
    log.error(`[${tag}] Async processing error:`, err);
    if (!outputStream.destroyed) {
      outputStream.emit("error", err);
    }
  });

  return outputStream;
};

/**
 * Splits text into chunks no longer than maxLength, preferring to break on
 * sentence boundaries and falling back to word/character boundaries when a
 * single sentence or word is too long.
 */
export const splitTextIntoChunks = (
  text: string,
  maxLength: number
): string[] => {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];

  let currentChunk = "";

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    if ((currentChunk + " " + trimmedSentence).length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }

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
