import {
  MsEdgeTTS,
  OUTPUT_FORMAT,
  PITCH,
  ProsodyOptions,
  VOLUME,
  Voice,
} from "edge-tts-node";
import { TTSOptions } from "../interfaces/tts.interface";
import { Readable } from "stream";

export const getVoices = async (): Promise<Voice[]> => {
  const client = new MsEdgeTTS();
  const voices = await client.getVoices();
  return voices;
};

export const getTTSStream = async ({
  text,
  voiceShortName = "vi-VN-HoaiMyNeural",
  rate = 1.25,
  pitch = PITCH.DEFAULT,
  volume = VOLUME.DEFAULT,
}: TTSOptions): Promise<Readable> => {
  const client = new MsEdgeTTS();
  await client.setMetadata(
    voiceShortName,
    OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
  );

  const options = new ProsodyOptions();
  options.pitch = pitch;
  options.rate = rate;
  options.volume = volume;

  return client.toStream(text, options);
};
