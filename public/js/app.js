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
  const audioPlayer = document.getElementById("audioPlayer");
  const chapterUrlInput = document.getElementById("chapterUrl");
  const textContentInput = document.getElementById("textContent");
  const linkInputContainer = document.getElementById("linkInputContainer");
  const textInputContainer = document.getElementById("textInputContainer");
  const linkModeBtn = document.getElementById("linkModeBtn");
  const textModeBtn = document.getElementById("textModeBtn");
  const rateInput = document.getElementById("rate");
  const submitButton = form.querySelector('button[type="submit"]');
  const navigationDiv = document.getElementById("chapterNavigation");
  const timerDisplay = document.getElementById("timerDisplay");
  const rateValueSpan = document.getElementById("rateValue");

  // Mode management
  let currentMode = "link"; // "link" or "text"

  const switchMode = (mode) => {
    currentMode = mode;
    if (mode === "link") {
      linkInputContainer.classList.remove("hidden");
      textInputContainer.classList.add("hidden");
      linkModeBtn.classList.add("border-blue-600", "dark:border-blue-400", "text-blue-600", "dark:text-blue-400");
      linkModeBtn.classList.remove("border-transparent", "text-gray-600", "dark:text-gray-400");
      textModeBtn.classList.remove("border-blue-600", "dark:border-blue-400", "text-blue-600", "dark:text-blue-400");
      textModeBtn.classList.add("border-transparent", "text-gray-600", "dark:text-gray-400");
    } else {
      linkInputContainer.classList.add("hidden");
      textInputContainer.classList.remove("hidden");
      textModeBtn.classList.add("border-blue-600", "dark:border-blue-400", "text-blue-600", "dark:text-blue-400");
      textModeBtn.classList.remove("border-transparent", "text-gray-600", "dark:text-gray-400");
      linkModeBtn.classList.remove("border-blue-600", "dark:border-blue-400", "text-blue-600", "dark:text-blue-400");
      linkModeBtn.classList.add("border-transparent", "text-gray-600", "dark:text-gray-400");
      // Clear navigation when switching to text mode
      navigationDiv.innerHTML = "";
      prefetchManager.resetPrefetch();
    }
  };

  linkModeBtn.addEventListener("click", () => switchMode("link"));
  textModeBtn.addEventListener("click", () => switchMode("text"));

  const audioHandler = new AudioHandler(audioPlayer);
  const chapterNavigator = new ChapterNavigator(
    navigationDiv,
    chapterUrlInput,
    form
  );
  const prefetchManager = new PrefetchManager(audioHandler, chapterNavigator);
  const timerHandler = new TimerHandler(audioPlayer, timerDisplay);
  timerHandler.init();

  const ttsSettings = new TTSSettings(voiceSelect, rateInput);

  // Add event listener for rate input to update playback rate
  rateInput.addEventListener('input', () => {
    audioPlayer.playbackRate = parseFloat(rateInput.value);
    rateValueSpan.textContent = rateInput.value;
  });

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
      audioPlayer.playbackRate = parseFloat(rateInput.value);
      rateValueSpan.textContent = rateInput.value; // Initialize the display value
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

    // Validate input based on mode
    if (currentMode === "link" && !chapterUrlInput.value.trim()) {
      errorDiv.textContent = "Vui lòng nhập link chương truyện";
      return;
    }
    if (currentMode === "text" && !textContentInput.value.trim()) {
      errorDiv.textContent = "Vui lòng nhập nội dung text";
      return;
    }

    isSubmitting = true;
    updateLoadingState(submitButton, true);
    errorDiv.textContent = "";
    resultDiv.textContent = "";

    await audioHandler.reset();
    prefetchManager.resetPrefetch();
    
    // Only update URL parameter for link mode
    if (currentMode === "link") {
      updateUrlParameter("chapterUrl", chapterUrlInput.value);
    }
    
    ttsSettings.saveSettings();
    audioPlayer.playbackRate = parseFloat(rateInput.value);
    
    try {
      // Create FormData based on current mode
      const formData = new FormData();
      if (currentMode === "link") {
        formData.append("chapterUrl", chapterUrlInput.value);
      } else {
        formData.append("textContent", textContentInput.value);
      }
      formData.append("voiceShortName", voiceSelect.value);

      const response = await fetch("/api/tts/convert", {
        method: "POST",
        body: formData,
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
    // Only prefetch in link mode
    if (
      currentMode === "link" &&
      audioHandler.isAudioLoaded &&
      audioPlayer.duration - audioPlayer.currentTime <= 60 &&
      !prefetchManager.isPrefetching
    ) {
      prefetchManager.startPrefetch();
    }
  });

  // Auto-play next chapter (only in link mode)
  audioPlayer.addEventListener("ended", async () => {
    // Only auto-play next chapter in link mode
    if (currentMode !== "link") {
      return;
    }

    const nextChapter = chapterNavigator.getNextChapter();
    if (!isValidUrl(nextChapter?.url)) {
      alert("Không tìm thấy chương tiếp theo!");
      return;
    }

    if (prefetchManager.isPrefetching) {
      try {
        const { chunks, response, reader } =
          prefetchManager.getPrefetchedData();

        if (!response) {
          throw new Error("Prefetch has failed!");
        }

        chapterNavigator.update(response, createNavigationUI);
        updateUrlParameter("chapterUrl", nextChapter.url);
        chapterUrlInput.value = nextChapter.url;

        await audioHandler.reset();

        // Process any prefetched chunks
        if (chunks?.length > 0) {
          audioPlayer.playbackRate = parseFloat(rateInput.value); // Apply playback rate for prefetched audio
          for (const chunk of chunks) {
            if (chunk) {
              const playbackStarted = audioHandler.addChunk(chunk);
              resultDiv.textContent = playbackStarted
                ? "Playing..."
                : "Loading audio...";
            }
          }
        }

        // If the reader is still available, continue reading
        if (reader) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                audioHandler.updateSource(true);
                prefetchManager.resetPrefetch();
                audioPlayer.playbackRate = parseFloat(rateInput.value); // Apply playback rate for prefetched audio
                break;
              }
              if (value) {
                audioHandler.addChunk(value);
              }
            }
          } catch (err) {
            if (err.name === "AbortError") {
              prefetchManager.resetPrefetch();
            } else {
              console.error("Error while continuing fetch: ", err);
              // Fall back to regular form submission
              chapterUrlInput.value = nextChapter.url;
              form.dispatchEvent(new Event("submit"));
            }
          }
        } else {
          // If no reader (prefetch completed), finalize the audio
          audioHandler.updateSource(true);
          prefetchManager.resetPrefetch();
          resultDiv.textContent = "";
        }
      } catch (err) {
        console.error("Error handling prefetched data:", err);
        // Fall back to regular form submission
        chapterUrlInput.value = nextChapter.url;
        form.dispatchEvent(new Event("submit"));
      }
    } else {
      chapterUrlInput.value = nextChapter.url;
      form.dispatchEvent(new Event("submit"));
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
