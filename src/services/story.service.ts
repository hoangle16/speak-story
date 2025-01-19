import axios from "axios";
import * as cheerio from "cheerio";
import * as puppeteer from "puppeteer";

// Types
interface Chapter {
  url: string | null;
  title: string | null;
}

interface StoryContent {
  content: string;
  currentChapter: Chapter;
  nextChapter: Chapter;
  prevChapter: Chapter;
}

interface ScraperConfig {
  domain: string;
  selectors: {
    content: string;
    title: string;
    nextChapter: {
      cheerio: string;
      puppeteer: string;
    };
    prevChapter: {
      cheerio: string;
      puppeteer: string;
    };
  };
}

// Helper functions
const formatUrl = (path: string | null, domain: string): string | null => {
  if (!path) return null;
  return new URL(path, `https://${domain}`).href;
};

const extractChapterInfo = (
  $: cheerio.CheerioAPI,
  selector: string
): Chapter => {
  const element = $(selector).first();
  return {
    url: element.attr("href") || null,
    title: element.text().trim() || null,
  };
};

const extractText = ($: cheerio.CheerioAPI, selector: string): string => {
  return $(selector).text().trim();
};

// Puppeteer helpers
const getElementTextWithPuppeteer = async (
  page: puppeteer.Page,
  selector: string
): Promise<string> => {
  const element = await page.$(selector);
  return element
    ? (await element.evaluate((el) => el.textContent?.trim())) || ""
    : "";
};

const getChapterInfoWithPuppeteer = async (
  page: puppeteer.Page,
  selector: string
): Promise<Chapter> => {
  const element = await page.$(selector);
  if (!element) return { url: null, title: null };

  const href = await element.evaluate((el) => el.getAttribute("href"));
  const title = await element.evaluate((el) => el.textContent?.trim());

  return {
    url: href,
    title: title || null,
  };
};

// Scraper creators for different sites
const createTruyenYYScraper = (): ScraperConfig => ({
  domain: "truyenyy.vip",
  selectors: {
    content: "#inner_chap_content_1",
    title: "h2.heading-font",
    nextChapter: {
      cheerio: "a.weui-btn_primary:contains('Tiếp')",
      puppeteer: "a.weui-btn_primary",
    },
    prevChapter: {
      cheerio: "a.weui-btn_default:contains('Trước')",
      puppeteer: "a.weui-btn_default",
    },
  },
});

const createTruyenComScraper = (): ScraperConfig => ({
  domain: "truyen.com",
  selectors: {
    content: "#chapter-c",
    title: "a.chapter-title",
    nextChapter: {
      cheerio: "#next_chap",
      puppeteer: "#next_chap",
    },
    prevChapter: {
      cheerio: "#prev_chap",
      puppeteer: "#prev_chap",
    },
  },
});

const createBNSachScraper = (): ScraperConfig => ({
  domain: "bnsach.com",
  selectors: {
    content: "#noi-dung",
    title: "#chuong-title",
    nextChapter: {
      cheerio: "a.page-next.chuong-button",
      puppeteer: "a.page-next.chuong-button",
    },
    prevChapter: {
      cheerio: "a.page-prev.chuong-button",
      puppeteer: "a.page-prev.chuong-button",
    },
  },
});

// Scraper map
const scrapers: Record<string, () => ScraperConfig> = {
  "truyenyy.vip": createTruyenYYScraper,
  "truyencom.com": createTruyenComScraper,
  "bnsach.com": createBNSachScraper,
};

// Main scraping functions
const scrapeWithPuppeteer = async (
  url: string,
  config: ScraperConfig
): Promise<StoryContent> => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    await page.setRequestInterception(true);
    // Block some script
    page.on("request", (request) => {
      const url = request.url();
      if (
        request.resourceType() === "script" &&
        url.includes("content-protector")
      ) {
        request.abort();
      } else {
        request.continue();
      }
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "networkidle2" });
    const content = await getElementTextWithPuppeteer(
      page,
      config.selectors.content
    );
    if (content?.length <= 0) {
      throw new Error("Couldn't extract content");
    }
    const title = await getElementTextWithPuppeteer(
      page,
      config.selectors.title
    );
    const nextChapter = await getChapterInfoWithPuppeteer(
      page,
      config.selectors.nextChapter.puppeteer
    );
    const prevChapter = await getChapterInfoWithPuppeteer(
      page,
      config.selectors.prevChapter.puppeteer
    );

    return {
      content: content + "\n" + ".Cách chương",
      currentChapter: { url, title },
      nextChapter: {
        url: formatUrl(nextChapter.url, config.domain),
        title: nextChapter.title,
      },
      prevChapter: {
        url: formatUrl(prevChapter.url, config.domain),
        title: prevChapter.title,
      },
    };
  } finally {
    await browser.close();
  }
};

const scrapeWithCheerio = async (
  url: string,
  config: ScraperConfig,
  html: string
): Promise<StoryContent> => {
  const $ = cheerio.load(html);

  const content = extractText($, config.selectors.content);
  if (content.length <= 0) {
    throw new Error("Couldn't extract content");
  }
  const title = extractText($, config.selectors.title);
  const nextChapter = extractChapterInfo(
    $,
    config.selectors.nextChapter.cheerio
  );
  const prevChapter = extractChapterInfo(
    $,
    config.selectors.prevChapter.cheerio
  );

  return {
    content: content + "\n" + ".Cách chương",
    currentChapter: { url, title },
    nextChapter: {
      url: formatUrl(nextChapter.url, config.domain),
      title: nextChapter.title,
    },
    prevChapter: {
      url: formatUrl(prevChapter.url, config.domain),
      title: prevChapter.title,
    },
  };
};

// Main function
export const getStoryContent = async (url: string): Promise<StoryContent> => {
  const domain = new URL(url).host;
  const getScraperConfig = scrapers[domain];

  if (!getScraperConfig) {
    throw new Error(`Unsupported domain: ${domain}`);
  }

  const config = getScraperConfig();

  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
    });
    console.log("get content with axios and cheerio");
    return await scrapeWithCheerio(url, config, data);
  } catch (err) {
    if (
      (axios.isAxiosError(err) && err.response?.status === 403) ||
      (err instanceof Error && err.message === "Couldn't extract content")
    ) {
      console.log("get content with puppeteer");
      return scrapeWithPuppeteer(url, config);
    }
    throw err;
  }
};
