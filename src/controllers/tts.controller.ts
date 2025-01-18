import { Request, Response } from "express";
import * as ttsService from "../services/tts.service";
import * as storyService from "../services/story.service";
import { RATE } from "edge-tts-node";

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
  }: { chapterUrl: string; voiceShortName?: string; rate?: number | RATE } =
    req.body;

  try {
    res.setHeader("Content-Type", "audio/mp3");
    res.setHeader("Transfer-Encoding", "chunked");

    console.log("ttsOptions", chapterUrl, voiceShortName, rate);
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

    console.log("content", content.substring(0, 100));

    const audioStream = await ttsService.getTTSStream({
      text: content,
      voiceShortName,
      rate,
    });

    audioStream.pipe(res);

    audioStream.on("end", () => {
      console.log("Steaming ended.");
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
