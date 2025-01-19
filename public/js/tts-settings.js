export class TTSSettings {
  constructor(voiceSelect, rateInput, pitchSelect) {
    this.voiceSelect = voiceSelect;
    this.rateInput = rateInput;
    this.pitchSelect = pitchSelect;
    this.storageKey = "ttsSettings";
  }

  saveSettings() {
    const settings = {
      voiceShortName: this.voiceSelect.value,
      rate: this.rateInput.value,
      pitch: this.pitchSelect.value,
    };
    localStorage.setItem(this.storageKey, JSON.stringify(settings));
  }

  loadSettings() {
    const settings = JSON.parse(localStorage.getItem(this.storageKey)) || {};
    if (settings.voiceShortName) {
      const optionsExisted = Array.from(this.voiceSelect.options).some(
        (option) => option.value === settings.voiceShortName
      );
      if (optionsExisted) {
        this.voiceSelect.value = settings.voiceShortName;
      }
    }
    if (settings.rate) {
      this.rateInput.value = settings.rate;
    }
    if (settings.pitch) {
      const optionsExisted = Array.from(this.pitchSelect.options).some(
        (option) => option.value === settings.pitch
      );
      if (optionsExisted) {
        this.pitchSelect.value = settings.pitch;
      }
    }
  }
}
