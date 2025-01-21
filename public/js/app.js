import { AudioHandler } from "./audio-handler.js";
import { ChapterNavigator } from "./chapter-navigation.js";
import { createNavigationUI, updateLoadingState } from "./ui-component.js";
import { ThemeManager } from "./theme-manager.js";
import { TimerHandler } from "./timer-handler.js";
import { TTSSettings } from "./tts-settings.js";
import { isValidUrl } from "./utils.js";
import { PrefetchManager } from "./prefetch-manager.js";

document.addEventListener("DOMContentLoaded", async () => {
  const themeManager = new ThemeManager();
  themeManager.init();

  const form = document.getElementById("conversionForm");
  const resultDiv = document.getElementById("result");
  const errorDiv = document.getElementById("error");
  const voiceSelect = document.getElementById("voice");
  const pitchSelect = document.getElementById("pitch");
  const audioPlayer = document.getElementById("audioPlayer");
  const chapterUrlInput = document.getElementById("chapterUrl");
  const rateInput = document.getElementById("rate");
  const submitButton = form.querySelector('button[type="submit"]');
  const navigationDiv = document.getElementById("chapterNavigation");
  const timerDisplay = document.getElementById("timerDisplay");

  const audioHandler = new AudioHandler(audioPlayer);
  const chapterNavigator = new ChapterNavigator(
    navigationDiv,
    chapterUrlInput,
    form
  );
  const prefetchManager = new PrefetchManager(audioHandler, chapterNavigator);
  const timerHandler = new TimerHandler(audioPlayer, timerDisplay);
  timerHandler.init();

  const ttsSettings = new TTSSettings(voiceSelect, rateInput, pitchSelect);

  async function initializeVoices() {
    try {
      const response = await fetch("/api/tts/voices");
      const voices = await response.json();
      voices.forEach((voice) => {
        const option = document.createElement("option");
        option.value = voice.ShortName;
        option.textContent = voice.ShortName;
        voiceSelect.append(option);
      });
      ttsSettings.loadSettings();
    } catch (err) {
      console.error("Error fetching voices: ", err);
      errorDiv.textContent = "Failed to load voices";
    }
  }

  await initializeVoices();

  // URL parameter handling
  const syncChapterUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const chapterUrlParam = urlParams.get("chapterUrl");
    if (chapterUrlParam) {
      chapterUrlInput.value = chapterUrlParam;
      form.dispatchEvent(new Event("submit"));
    }
  };

  const updateUrlParameter = (param, value) => {
    const url = new URL(window.location.href);
    url.searchParams.set(param, value);
    window.history.replaceState({}, "", url);
  };

  // Form submission handler
  let isSubmitting = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    isSubmitting = true;
    updateLoadingState(submitButton, true);
    errorDiv.textContent = "";
    resultDiv.textContent = "";

    await audioHandler.reset();
    prefetchManager.resetPrefetch();
    updateUrlParameter("chapterUrl", chapterUrlInput.value);
    ttsSettings.saveSettings();
    try {
      const response = await fetch("/api/tts/convert", {
        method: "POST",
        body: new FormData(form),
        signal: audioHandler.createNewController(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Failed to convert text to speech"
        );
      }

      resultDiv.textContent = "Loading...";

      chapterNavigator.update(response, createNavigationUI);
      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          audioHandler.updateSource(true);
          resultDiv.textContent = "";
          break;
        }

        const playbackStarted = audioHandler.addChunk(value);
        resultDiv.textContent = playbackStarted
          ? "Playing..."
          : "Loading audio...";

        if (playbackStarted) {
          isSubmitting = false;
          updateLoadingState(submitButton, false);
        }
      }
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("Request aborted");
        return;
      }

      console.error("Error: ", err);
      errorDiv.textContent = err?.message;
    } finally {
      isSubmitting = false;
      updateLoadingState(submitButton, false);
    }
  });

  audioPlayer.addEventListener("timeupdate", () => {
    if (
      audioHandler.isAudioLoaded &&
      audioPlayer.duration - audioPlayer.currentTime <= 30 &&
      !prefetchManager.isPrefetching
    ) {
      console.log(
        `isLoaded ${audioHandler.isAudioLoaded}, duration: ${
          audioPlayer.duration
        }, currentTime ${audioPlayer.currentTime}, remainingTime: ${
          audioPlayer.duration - audioPlayer.currentTime
        }`
      );
      prefetchManager.startPrefetch();
    }
  });

  // Auto-play next chapter
  audioPlayer.addEventListener("ended", async () => {
    const nextChapter = chapterNavigator.getNextChapter();
    if (!isValidUrl(nextChapter?.url)) {
      alert("Không tìm thấy chương tiếp theo!");
      return;
    }
    if (prefetchManager.isPrefetching) {
      try {
        const { chunks, response, reader } =
          prefetchManager.getPrefetchedData();
        if (response) {
          chapterNavigator.update(response, createNavigationUI);
          updateUrlParameter("chapterUrl", nextChapter.url);
          chapterUrlInput.value = nextChapter.url;
        } else {
          throw new Error("Prefetch has failed!");
        }

        await audioHandler.reset();

        if (chunks?.length > 0) {
          console.log("prefetch chunks length: ", chunks.length);
          chunks.forEach((chunk) => {
            const playbackStarted = audioHandler.addChunk(chunk);
            resultDiv.textContent = playbackStarted
              ? "Playing..."
              : "Loading audio...";
          });
          if (!reader) {
            audioHandler.updateSource(true);
            prefetchManager.resetPrefetch();
          }
        }

        console.log("prefetch reader", reader);
        if (reader) {
          try {
            while (true) {
              const { done, value } = reader.read();
              console.log(done, value?.length);
              if (done) {
                audioHandler.updateSource(true);
                prefetchManager.resetPrefetch();
                console.log("prefetch done, reset");
                break;
              }
              audioHandler.addChunk(value);
            }
          } catch (err) {
            if (err.name !== "AbortError") {
              console.error("Error while continuing fetch: ", err);
              chapterUrlInput.value = nextChapter.url;
              form.dispatchEvent(new Event("submit"));
            }
          }
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Error while continuing fetch: ", err);
        }
        chapterUrlInput.value = nextChapter.url;
        form.dispatchEvent(new Event("submit"));
      }
    } else {
      chapterUrlInput.value = nextChapter.url;
      form.dispatchEvent(new Event("submit"));
      return;
    }
  });

  // Initial sync
  syncChapterUrl();

  // Cleanup
  return () => {
    audioHandler.cleanup();
    themeManager.cleanup();
    timerHandler.cleanup();
  };
});
