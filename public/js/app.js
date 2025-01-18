document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("conversionForm");
  const resultDiv = document.getElementById("result");
  const errorDiv = document.getElementById("error");
  const voiceSelect = document.getElementById("voice");
  const audioPlayer = document.getElementById("audioPlayer");
  const chapterUrlInput = document.getElementById("chapterUrl");
  const timerInput = document.getElementById("timer");
  const timerDisplay = document.getElementById("timerDisplay");
  const submitButton = form.querySelector('button[type="submit"]');
  const navigationDiv = document.getElementById("chapterNavigation");

  let audioChunks = [];
  let totalBytesReceived = 0;
  let lastUpdate = 0;
  let currentBlobUrl = null;
  const MINIMUM_BUFFER_SIZE = 128 * 1024;
  let nextChapterData = null;

  async function getVoices() {
    try {
      const response = await fetch("/api/tts/voices");
      const voices = await response.json();
      voices.forEach((voice) => {
        const option = document.createElement("option");
        option.value = voice.ShortName;
        option.textContent = voice.ShortName;
        voiceSelect.append(option);
      });
    } catch (err) {
      console.error("Error fetching voices: ", err);
    }
  }
  await getVoices();

  function resetPlayerState() {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;

    audioChunks = [];
    totalBytesReceived = 0;
    lastUpdate = 0;

    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }
  }

  function updateAudioSource() {
    const oldUrl = currentBlobUrl;

    const updatedBlob = new Blob(audioChunks, { type: "audio/mp3" });
    currentBlobUrl = URL.createObjectURL(updatedBlob);

    const currentTime = audioPlayer.currentTime;
    const wasPlaying = !audioPlayer.paused;

    audioPlayer.src = currentBlobUrl;
    audioPlayer.currentTime = currentTime;

    if (wasPlaying) {
      audioPlayer.play();
    }

    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
    }
  }

  function updateChapterNavigation(response) {
    const decodeChapter = (encodedStr) => {
      if (!encodedStr) return null;
      try {
        return JSON.parse(decodeURIComponent(encodedStr));
      } catch (e) {
        console.error("Error decoding chapter info:", e);
        return null;
      }
    };

    const currentChapter = decodeChapter(
      response.headers.get("X-Current-Chapter")
    );
    nextChapterData = decodeChapter(response.headers.get("X-Next-Chapter"));
    const prevChapter = decodeChapter(response.headers.get("X-Prev-Chapter"));

    if (!currentChapter) {
      navigationDiv.innerHTML = "";
      return;
    }

    navigationDiv.innerHTML = `
    <div class="flex flex-col items-center space-y-4 my-6 p-4 rounded-lg bg-gray-50">
      <h3 class="text-xl font-semibold text-gray-800">
        ${currentChapter.title || "Current Chapter"}
      </h3>
      <div class="flex flex-wrap justify-center gap-4">
        ${
          prevChapter
            ? `
          <button 
            class="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors" 
            data-url="${prevChapter.url}"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
            ${prevChapter.title}
          </button>
        `
            : ""
        }
        ${
          nextChapterData
            ? `
          <button 
            class="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            data-url="${nextChapterData.url}"
          >
            ${nextChapterData.title}
            <svg class="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        `
            : ""
        }
      </div>
    </div>
  `;

    navigationDiv.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", async () => {
        chapterUrlInput.value = button.dataset.url;
        form.dispatchEvent(new Event("submit"));
      });
    });
  }

  const updateUrlParameter = (param, value) => {
    const url = new URL(window.location.href);
    url.searchParams.set(param, value);
    window.history.replaceState({}, "", url);
  };

  audioPlayer.addEventListener("ended", () => {
    if (nextChapterData) {
      chapterUrlInput.value = nextChapterData.url;
      form.dispatchEvent(new Event("submit"));
    }
  });

  let isSubmitting = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    isSubmitting = true;
    submitButton.disabled = true;
    submitButton.textContent = "Đang xử lý...";

    resetPlayerState();
    updateUrlParameter("chapterUrl", chapterUrlInput.value);
    try {
      const response = await fetch("/api/tts/convert", {
        method: "POST",
        body: new FormData(form),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Failed to convert text to speech"
        );
      }

      updateChapterNavigation(response);

      const reader = response.body.getReader();
      let playbackStarted = false;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          updateAudioSource();
          resultDiv.textContent = `Loaded`;
          break;
        }

        audioChunks.push(value);
        totalBytesReceived += value.length;
        resultDiv.textContent = `Loading...`;

        if (!playbackStarted && totalBytesReceived >= MINIMUM_BUFFER_SIZE) {
          updateAudioSource();
          audioPlayer.play();
          playbackStarted = true;
          resultDiv.textContent += " (Playing...)";
          lastUpdate = totalBytesReceived;

          isSubmitting = false;
          submitButton.disabled = false;
          submitButton.textContent = "Submit";
        } else if (
          playbackStarted &&
          audioPlayer.duration - audioPlayer.currentTime < 10
        ) {
          updateAudioSource();
          lastUpdate = totalBytesReceived;
        }
      }
    } catch (err) {
      console.error("Error: ", err);
      errorDiv.textContent = err?.message;
    } finally {
      isSubmitting = false;
      submitButton.disabled = false;
      submitButton.textContent = "Submit";
    }
  });

  // Sync chapterUrls
  const urlPrams = new URLSearchParams(window.location.search);
  const chapterUrlParam = urlPrams.get("chapterUrl");
  if (chapterUrlParam) {
    chapterUrlInput.value = chapterUrlParam;
    form.dispatchEvent(new Event("submit"));
  }

  return () => {
    if (audioPlayer.src) {
      URL.revokeObjectURL(audioPlayer.src);
    }
  };
});
