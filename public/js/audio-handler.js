export class AudioHandler {
  constructor(audioPlayer, minBufferSize = 128 * 1024) {
    this.audioPlayer = audioPlayer;
    this.audioChunks = [];
    this.totalBytesReceived = 0;
    this.lastUpdate = 0;
    this.currentBlobUrl = null;
    this.MINIMUM_BUFFER_SIZE = minBufferSize;
    this.playbackStarted = false;
    this.isCleaningUp = false;
    this.currentController = null;
  }

  async reset() {
    // Abort any ongoing stream
    if (this.currentController) {
      this.currentController.abort();
      this.currentController = null;
    }

    this.isCleaningUp = true;

    this.audioPlayer.pause();
    this.audioPlayer.src = "";
    this.audioPlayer.removeAttribute("src");
    this.audioPlayer.load();
    this.audioChunks = [];
    this.totalBytesReceived = 0;
    this.lastUpdate = 0;
    this.playbackStarted = false;

    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }

    // Wait a small amount of time to ensure cleanup is complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    this.isCleaningUp = false;
  }

  updateSource() {
    if (this.isCleaningUp) return;

    const oldUrl = this.currentBlobUrl;

    if (this.audioChunks.length > 0) {
      const updatedBlob = new Blob(this.audioChunks, { type: "audio/mp3" });
      this.currentBlobUrl = URL.createObjectURL(updatedBlob);

      const currentTime = this.audioPlayer.currentTime;
      const wasPlaying = !this.audioPlayer.paused;

      this.audioPlayer.src = this.currentBlobUrl;
      this.audioPlayer.load(); // Force reload;
      this.audioPlayer.currentTime = currentTime;

      if (wasPlaying && !this.isCleaningUp) {
        this.audioPlayer.play().catch((err) => {
          console.error("Error resuming playback: " + err);
        });
      }
    }

    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
    }
  }

  addChunk(chunk) {
    if (this.isCleaningUp) return false;

    this.audioChunks.push(chunk);
    this.totalBytesReceived += chunk.length;

    if (
      !this.playbackStarted &&
      this.totalBytesReceived >= this.MINIMUM_BUFFER_SIZE
    ) {
      this.updateSource();
      if (!this.isCleaningUp) {
        this.audioPlayer.play().catch((err) => {
          console.error("Error resuming playback: " + err);
        });
      }
      this.playbackStarted = true;
      this.lastUpdate = this.totalBytesReceived;
      return true;
    } else if (
      this.playbackStarted &&
      this.audioPlayer.duration - this.audioPlayer.currentTime < 10 &&
      !this.isCleaningUp
    ) {
      this.updateSource();
      this.lastUpdate = this.totalBytesReceived;
    }
    return false;
  }

  createNewController() {
    this.currentController = new AbortController();
    return this.currentController.signal;
  }

  async cleanup() {
    if (this.currentController) {
      this.currentController.abort();
      this.currentController = null;
    }
    await this.reset();
    this.audioPlayer = null;
  }
}
