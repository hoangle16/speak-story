export class PrefetchManager {
  constructor(audioHandler, chapterNavigator) {
    this.audioHandler = audioHandler;
    this.chapterNavigator = chapterNavigator;
    this.prefetchController = null;
    this.prefetchedChunks = [];
    this.isPrefetching = false;
    this.prefetchedResponse = null;
    this.prefetchReader = null;
  }

  async startPrefetch() {
    if (this.isPrefetching) return;
    console.log("startPrefetch");
    const nextChapter = this.chapterNavigator.getNextChapter();
    if (!nextChapter?.url) return;

    this.isPrefetching = true;
    this.prefetchController = new AbortController();
    this.prefetchedChunks = [];

    try {
      const formData = new FormData();
      formData.append("chapterUrl", nextChapter.url);
      formData.append("voice", document.getElementById("voice").value);
      formData.append("rate", document.getElementById("rate").value);
      formData.append("pitch", document.getElementById("pitch").value);

      this.prefetchedResponse = await fetch("/api/tts/convert", {
        method: "POST",
        body: formData,
        signal: this.prefetchController.signal,
      });

      if (!this.prefetchedResponse.ok) {
        throw new Error("Prefetch failed");
      }

      this.prefetchReader = this.prefetchedResponse.body.getReader();
      this.continuePrefetching();
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Prefetch error:", err);
      }
      this.resetPrefetch();
    }
  }

  async continuePrefetching() {
    console.log("continuePrefetching called");
    try {
      while (true) {
        const { done, value } = await this.prefetchReader.read();
        if (done) break;
        this.prefetchedChunks.push(value);
      }
      console.log("continuePrefetching done");
      this.prefetchReader = null;
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Error while continuing prefetch:", err);
      }
    }
  }

  resetPrefetch() {
    console.log("resetPrefetch called");
    if (this.prefetchController) {
      this.prefetchController.abort();
      this.prefetchController = null;
    }
    this.prefetchReader = null;
    this.prefetchedChunks = [];
    this.isPrefetching = false;
    this.prefetchedResponse = null;
  }

  getPrefetchedData() {
    console.log("getPrefetchedData called");
    return {
      chunks: [...this.prefetchedChunks],
      response: this.prefetchedResponse,
      reader: this.prefetchReader,
    };
  }
}
