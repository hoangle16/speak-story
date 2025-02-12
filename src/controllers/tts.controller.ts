import { Request, Response } from "express";
import * as ttsService from "../services/tts.service";
import * as storyService from "../services/story.service";
import { PITCH, RATE } from "edge-tts-node";

export const getVoices = async (req: Request, res: Response): Promise<void> => {
  try {
    const voices = await ttsService.getVoices();
    const vietnameseVoices = voices.filter((voice) =>
      voice.Locale.startsWith("vi-")
    );
    res.json(vietnameseVoices);
  } catch (err) {
    console.error("Error fetching voice", err);
    res.status(500).json({ message: "Error fetching voices" });
  }
};

export const convertTextToSpeech = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {
    chapterUrl,
    voiceShortName,
    rate,
    pitch,
  }: {
    chapterUrl: string;
    voiceShortName?: string;
    rate?: number | RATE;
    pitch?: string | PITCH;
  } = req.body;

  try {
    res.setHeader("Content-Type", "audio/mp3");
    res.setHeader("Transfer-Encoding", "chunked");
    const { content, currentChapter, nextChapter, prevChapter } =
      await storyService.getStoryContent(chapterUrl);

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

    console.log(
      `[${new Date().toLocaleTimeString()}] content: `,
      content.substring(0, 100)
    );

    const audioStream = await ttsService.getTTSStream({
      text: content,
      voiceShortName,
      rate,
      pitch,
    });

    audioStream.pipe(res);

    audioStream.on("end", () => {
      console.log(`[${new Date().toLocaleTimeString()}] Steaming ended.`);
      res.end();
    });
    audioStream.on("error", (err) => {
      console.error("Error streaming audio", err);
      res.status(500).json({ message: "Error streaming audio" });
    });
  } catch (err) {
    console.error("Error converting text to speech", err);
    const message =
      err instanceof Error ? err.message : "Error converting text to speech";
    res.status(500).json({ message });
  }
};
