export class TTSSettings {
  constructor(voiceSelect, rateInput) {
    this.voiceSelect = voiceSelect;
    this.rateInput = rateInput;
    this.storageKey = "ttsSettings";
  }

  saveSettings() {
    const settings = {
      voiceShortName: this.voiceSelect.value,
      rate: this.rateInput.value,
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
  }
}
