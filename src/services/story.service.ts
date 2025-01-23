import axios from "axios";
import * as cheerio from "cheerio";
import * as puppeteer from "puppeteer";
import { configService } from "../services/config.service";
import {
  Chapter,
  ChapterNumberPattern,
  ScraperConfig,
  StoryContent,
} from "../interfaces/scraper.interface";

// Helper functions
const formatUrl = (path: string | null, domain: string): string | null => {
  if (!path) return null;
  return new URL(path, `https://${domain}`).href;
};

const extractChapterNumber = (
  url: string,
  pattern: ChapterNumberPattern
): number | null => {
  const regexString = pattern.regex;
  const regexParts = regexString.match(/^\/(.*)\/([gimsuy]*)$/);
  if (!regexParts) {
    throw new Error("Invalid regex format");
  }
  const regex = new RegExp(regexParts[1], regexParts[2]);
  const match = url.match(regex);

  if (!match) return null;

  const numberStr = match[pattern.groupIndex];
  const number = parseInt(numberStr, 10);
  return isNaN(number) ? null : number;
};

const generateChapterUrl = (
  currentUrl: string,
  newNumber: number,
  pattern: { regex: string; groupIndex: number }
): string | null => {
  const regexString = pattern.regex;
  const regexParts = regexString.match(/^\/(.*)\/([gimsuy]*)$/);
  if (!regexParts) {
    throw new Error("Invalid regex format");
  }
  const regex = new RegExp(regexParts[1], regexParts[2]);

  const match = currentUrl.match(regex);
  if (!match) return null;

  const newUrl = currentUrl.replace(regex, (original) => {
    return original.replace(match[pattern.groupIndex], newNumber.toString());
  });

  return newUrl;
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
        ["image", "stylesheet", "font"].indexOf(request.resourceType()) !==
          -1 ||
        (request.resourceType() === "script" &&
          url.includes("content-protector"))
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

    let nextChapter: Chapter = { url: null, title: null };
    let prevChapter: Chapter = { url: null, title: null };
    if (config.chapterNumber?.pattern) {
      const currentNumber = extractChapterNumber(
        url,
        config.chapterNumber.pattern
      );
      if (currentNumber !== null) {
        const nextUrl = generateChapterUrl(
          url,
          currentNumber + 1,
          config.chapterNumber.pattern
        );
        const prevUrl = generateChapterUrl(
          url,
          currentNumber - 1,
          config.chapterNumber.pattern
        );
        nextChapter = {
          url: formatUrl(nextUrl, config.domain),
          title: `Chương ${currentNumber + 1}`,
        };
        prevChapter = {
          url: formatUrl(prevUrl, config.domain),
          title: `Chương ${currentNumber - 1}`,
        };
      } else {
        const nextChapter = await getChapterInfoWithPuppeteer(
          page,
          config.selectors.nextChapter!.puppeteer
        );
        const prevChapter = await getChapterInfoWithPuppeteer(
          page,
          config.selectors.prevChapter!.puppeteer
        );
        nextChapter.url = formatUrl(nextChapter.url, config.domain);
        prevChapter.url = formatUrl(prevChapter.url, config.domain);
      }
    }

    return {
      content: content + "\n" + ".Cách chương",
      currentChapter: { url, title },
      nextChapter,
      prevChapter,
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

  let nextChapter: Chapter = { url: null, title: null };
  let prevChapter: Chapter = { url: null, title: null };
  if (config.chapterNumber?.pattern) {
    const currentNumber = extractChapterNumber(
      url,
      config.chapterNumber.pattern
    );

    if (currentNumber !== null) {
      const nextUrl = generateChapterUrl(
        url,
        currentNumber + 1,
        config.chapterNumber.pattern
      );
      const prevUrl = generateChapterUrl(
        url,
        currentNumber - 1,
        config.chapterNumber.pattern
      );

      nextChapter = {
        url: formatUrl(nextUrl, config.domain),
        title: `Chương ${currentNumber + 1}`,
      };
      prevChapter = {
        url: formatUrl(prevUrl, config.domain),
        title: `Chương ${currentNumber - 1}`,
      };
    }
  } else {
    nextChapter = extractChapterInfo($, config.selectors.nextChapter!.cheerio);
    prevChapter = extractChapterInfo($, config.selectors.prevChapter!.cheerio);
    nextChapter.url = formatUrl(nextChapter.url, config.domain);
    prevChapter.url = formatUrl(prevChapter.url, config.domain);
  }

  return {
    content: content + "\n" + ".Cách chương",
    currentChapter: { url, title },
    nextChapter,
    prevChapter,
  };
};

// Main function
export const getStoryContent = async (url: string): Promise<StoryContent> => {
  const domain = new URL(url).hostname;
  const key = domain.replace(/^(www\.)?/, "").split(".")[0];
  const config = await configService.getConfig(key);

  if (!config) {
    throw new Error(`Unsupported domain: ${domain}`);
  }

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
      console.log(
        `[${new Date().toLocaleTimeString()}] get content with puppeteer`
      );
      return scrapeWithPuppeteer(url, config);
    }
    throw err;
  }
};
