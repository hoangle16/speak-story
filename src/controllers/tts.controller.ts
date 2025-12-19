import { Request, Response } from "express";
import * as ttsService from "../services/tts.service";
import * as storyService from "../services/story.service";
import { log } from "../utils/log";
import { Chapter } from "../interfaces/scraper.interface";

export const getVoices = async (req: Request, res: Response): Promise<void> => {
  try {
    const voices = await ttsService.getVoices();
    const vietnameseVoices = voices.filter((voice) =>
      voice.Locale.startsWith("vi-")
    );
    res.json(vietnameseVoices);
  } catch (err) {
    log.error("Error fetching voices", err);
    res.status(500).json({ 
      message: "Error fetching voices",
      error: err instanceof Error ? err.message : "Unknown error"
    });
  }
};

export const convertTextToSpeech = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {
    chapterUrl,
    textContent,
    voiceShortName,
  }: {
    chapterUrl?: string;
    textContent?: string;
    voiceShortName?: string;
  } = req.body;

  try {
    let content: string;
    let currentChapter: Chapter | null = null;
    let nextChapter: Chapter | null = null;
    let prevChapter: Chapter | null = null;

    // Handle both link mode and text mode
    if (textContent) {
      // Text mode: use text directly
      log.info(`[${new Date().toLocaleTimeString()}] Starting TTS for direct text input`);
      content = textContent.trim();
    } else if (chapterUrl) {
      // Link mode: crawl content from URL
      log.info(`[${new Date().toLocaleTimeString()}] Starting TTS for chapter: ${chapterUrl}`);
      const storyContent = await storyService.getStoryContent(chapterUrl);
      content = storyContent.content;
      currentChapter = storyContent.currentChapter;
      nextChapter = storyContent.nextChapter;
      prevChapter = storyContent.prevChapter;
    } else {
      res.status(400).json({ message: "Either chapterUrl or textContent must be provided" });
      return;
    }

    if (!content || content.trim().length === 0) {
      res.status(400).json({ message: "No content found to convert to speech" });
      return;
    }

    // set response headers immediately when starting
    res.setHeader("Content-Type", "audio/mp3");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Only set chapter headers if we have chapter data (link mode)
    if (currentChapter || nextChapter || prevChapter) {
      const encodedChapters = {
        current: currentChapter
          ? encodeURIComponent(JSON.stringify(currentChapter))
          : "",
        next: nextChapter ? encodeURIComponent(JSON.stringify(nextChapter)) : "",
        prev: prevChapter ? encodeURIComponent(JSON.stringify(prevChapter)) : "",
      };

      res.setHeader("X-Current-Chapter", encodedChapters.current);
      res.setHeader("X-Next-Chapter", encodedChapters.next);
      res.setHeader("X-Prev-Chapter", encodedChapters.prev);
    }

    log.dev(
      `[${new Date().toLocaleTimeString()}] Content length: ${content.length} chars, Preview: ${content.substring(0, 100)}...`
    );

    // generate TTS stream with GTTS - start streaming immediately
    const audioStream = await ttsService.getTTSStream({
      text: content,
      voiceShortName,
    });

    let streamEnded = false;
    let streamError = false;
    let bytesStreamed = 0;
    let firstChunkSent = false;

    // setup error handling and cleanup
    let timeout: NodeJS.Timeout | undefined;
    
    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      if (!audioStream.destroyed) {
        audioStream.destroy();
      }
    };

    // handle client disconnect
    req.on('close', () => {
      log.info(`[${new Date().toLocaleTimeString()}] Client disconnected`);
      streamError = true;
      cleanup();
    });

    req.on('aborted', () => {
      log.info(`[${new Date().toLocaleTimeString()}] Request aborted`);
      streamError = true;
      cleanup();
    });

    audioStream.on("data", (chunk) => {
      if (!streamError && !res.destroyed) {
        try {
          if (!firstChunkSent) {
            log.dev(`[${new Date().toLocaleTimeString()}] Sending first chunk to client (${chunk.length} bytes)`);
            firstChunkSent = true;
          }
          
          const writeSuccess = res.write(chunk);
          bytesStreamed += chunk.length;
          
          // log progress every 50KB instead of 100KB for better responsiveness
          if (bytesStreamed % (50 * 1024) < chunk.length) {
            log.dev(`[${new Date().toLocaleTimeString()}] Streamed: ${Math.round(bytesStreamed / 1024)}KB`);
          }

          // if buffer is full, pause stream
          if (!writeSuccess) {
            audioStream.pause();
            res.once('drain', () => {
              if (!streamError && !audioStream.destroyed) {
                audioStream.resume();
              }
            });
          }
          
        } catch (writeError) {
          log.error("Error writing to response:", writeError);
          streamError = true;
          cleanup();
        }
      }
    });

    audioStream.on("end", () => {
      if (!streamEnded && !streamError) {
        streamEnded = true;
        log.info(`[${new Date().toLocaleTimeString()}] Streaming completed successfully. Total: ${Math.round(bytesStreamed / 1024)}KB`);
        
        try {
          res.end();
        } catch (endError) {
          log.error("Error ending response:", endError);
        }
        cleanup();
      }
    });

    audioStream.on("error", (err) => {
      streamError = true;
      log.error("Error streaming audio:", err);
      
      try {
        if (!res.headersSent) {
          res.status(500).json({ 
            message: "Error streaming audio",
            error: err instanceof Error ? err.message : "Unknown streaming error"
          });
        } else if (!res.destroyed) {
          res.end();
        }
      } catch (responseError) {
        log.error("Error handling stream error:", responseError);
      }
      
      cleanup();
    });

    // timeout fallback - increase to 8 minutes for long content
    timeout = setTimeout(() => {
      if (!streamEnded && !streamError) {
        log.error("Stream timeout after 8 minutes");
        streamError = true;
        
        try {
          if (!res.headersSent) {
            res.status(408).json({ message: "Stream timeout" });
          } else if (!res.destroyed) {
            res.end();
          }
        } catch (timeoutError) {
          log.error("Error handling timeout:", timeoutError);
        }
        
        cleanup();
      }
    }, 8 * 60 * 1000);

    // clear timeout when stream ends
    audioStream.on('end', cleanup);
    audioStream.on('error', cleanup);

  } catch (err) {
    log.error("Error converting text to speech:", err);
    
    const errorMessage = err instanceof Error ? err.message : "Error converting text to speech";
    
    try {
      if (!res.headersSent) {
        res.status(500).json({ 
          message: errorMessage,
          timestamp: new Date().toISOString(),
          chapterUrl: chapterUrl || undefined,
          textContent: textContent ? "***" : undefined,
          service: 'GTTS'
        });
      }
    } catch (responseError) {
      log.error("Error sending error response:", responseError);
    }
  }
};