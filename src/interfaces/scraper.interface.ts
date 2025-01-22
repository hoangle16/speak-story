export interface Chapter {
  url: string | null;
  title: string | null;
}

export interface StoryContent {
  content: string;
  currentChapter: Chapter;
  nextChapter: Chapter;
  prevChapter: Chapter;
}

export interface SelectorConfig {
  cheerio: string;
  puppeteer: string;
}

export interface ScraperConfig {
  domain: string;
  selectors: {
    content: string;
    title: string;
    nextChapter: SelectorConfig;
    prevChapter: SelectorConfig;
  };
}
