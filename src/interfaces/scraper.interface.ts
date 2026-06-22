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

export interface ChapterNumberPattern {
  regex: string;
  groupIndex: number;
}

export interface ScraperConfig {
  domain: string;
  // Other hostnames (old domains/TLDs, rebrands, etc.) that should resolve
  // to this same config. Populated either manually via the admin UI or
  // automatically by the self-healing domain detection in story.service.ts.
  aliases?: string[];
  selectors: {
    content: string;
    title: string;
    nextChapter?: SelectorConfig;
    prevChapter?: SelectorConfig;
  };
  chapterNumber?: {
    pattern: ChapterNumberPattern;
  };
}
