export class AudioHandler {
  constructor(audioPlayer, minBufferSize = 64 * 1024) {
    this.audioPlayer = audioPlayer;
    this.audioChunks = [];
    this.totalBytesReceived = 0;
    this.lastUpdate = 0;
    this.currentBlobUrl = null;
    this.MINIMUM_BUFFER_SIZE = minBufferSize;
    this.playbackStarted = false;
    this.isCleaningUp = false;
    this.currentController = null;
    this.isAudioLoaded = false;
    this.TIME_GAP = 5;
  }

  async reset() {
    // Abort any ongoing stream
    if (this.currentController) {
      this.currentController.abort();
      this.currentController = null;
    }

    this.isCleaningUp = true;

    const currentPlaybackRate = this.audioPlayer.playbackRate; // Save current playback rate

    this.audioPlayer.pause();
    this.audioPlayer.src = "";
    this.audioPlayer.removeAttribute("src");
    this.audioPlayer.load();
    this.audioPlayer.playbackRate = currentPlaybackRate; // Restore playback rate

    this.audioChunks = [];
    this.totalBytesReceived = 0;
    this.lastUpdate = 0;
    this.playbackStarted = false;
    this.isAudioLoaded = false;

    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }

    // Wait a small amount of time to ensure cleanup is complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    this.isCleaningUp = false;
  }

  updateSource(isAudioLoaded = false) {
    if (this.isCleaningUp) return;

    const oldUrl = this.currentBlobUrl;

    if (this.audioChunks.length > 0) {
      const updatedBlob = new Blob(this.audioChunks, { type: "audio/mp3" });
      this.currentBlobUrl = URL.createObjectURL(updatedBlob);

      const currentTime = this.audioPlayer.currentTime;
      const wasPlaying = !this.audioPlayer.paused;
      const currentPlaybackRate = this.audioPlayer.playbackRate; // Store current playback rate

      this.audioPlayer.src = this.currentBlobUrl;
      this.audioPlayer.load(); // Force reload;
      this.audioPlayer.currentTime = currentTime;
      this.audioPlayer.playbackRate = currentPlaybackRate; // Reapply playback rate

      if (wasPlaying && !this.isCleaningUp) {
        this.audioPlayer.play().catch((err) => {
          console.error("Error resuming playback: " + err);
        });
      }
    }

    if (isAudioLoaded) {
      this.isAudioLoaded = true;
    }

    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
    }
  }

  addChunk(chunk) {
    if (this.isCleaningUp) return false;

    this.audioChunks.push(chunk);
    this.totalBytesReceived += chunk.length || 0;

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
      this.audioPlayer.duration - this.audioPlayer.currentTime <
        this.TIME_GAP &&
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
