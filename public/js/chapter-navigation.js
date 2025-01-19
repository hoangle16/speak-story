export class ChapterNavigator {
  constructor(navigationDiv, chapterUrlInput, form) {
    this.navigationDiv = navigationDiv;
    this.chapterUrlInput = chapterUrlInput;
    this.form = form;
    this.nextChapterData = null;
  }

  decodeChapter(encodedStr) {
    if (!encodedStr) return null;
    try {
      return JSON.parse(decodeURIComponent(encodedStr));
    } catch (e) {
      console.error("Error decoding chapter info:", e);
      return null;
    }
  }

  update(response, createNavigationUI) {
    const currentChapter = this.decodeChapter(
      response.headers.get("X-Current-Chapter")
    );
    this.nextChapterData = this.decodeChapter(
      response.headers.get("X-Next-Chapter")
    );
    const prevChapter = this.decodeChapter(
      response.headers.get("X-Prev-Chapter")
    );

    if (!currentChapter) {
      this.navigationDiv.innerHTML = "";
      return;
    }

    this.navigationDiv.innerHTML = createNavigationUI(
      currentChapter,
      prevChapter,
      this.nextChapterData
    );
    this.setupNavigationListeners();
  }

  setupNavigationListeners() {
    this.navigationDiv.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        this.chapterUrlInput.value = button.dataset.url;
        this.form.dispatchEvent(new Event("submit"));
      });
    });
  }

  getNextChapter() {
    return this.nextChapterData;
  }
}
