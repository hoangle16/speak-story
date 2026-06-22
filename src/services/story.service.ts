import axios, { AxiosResponse } from "axios";
import * as cheerio from "cheerio";
import * as puppeteer from "puppeteer";
import { configService } from "../services/config.service";
import { log } from "../utils/log";
import {
  Chapter,
  ChapterNumberPattern,
  ScraperConfig,
  StoryContent,
} from "../interfaces/scraper.interface";

// Helper functions
const formatUrl = (
  path: string | null,
  liveDomain: string | undefined,
  configDomain: string
): string | null => {
  if (!path) return null;
  // Prefer the domain the page was *actually* served from over the one
  // saved in the config. This way, if a site redirects to a new domain or
  // TLD (e.g. webaudio.com -> webaudio.biz), generated next/prev chapter
  // links automatically follow the live domain instead of pointing back at
  // a possibly-dead, stale one - no manual config edit needed.
  const domain = liveDomain || configDomain;
  return new URL(path, `https://${domain}`).href;
};

const normalizeContent = (content: string): string => {
  return content
    .replace(/·/g, "")
    .replace(/\s{2,}/g, " ") 
    .trim();
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

    // page.url() reflects wherever the browser actually ended up after any
    // redirects, which may differ from the `url` we were asked to scrape.
    let liveDomain: string | undefined;
    try {
      liveDomain = new URL(page.url()).hostname;
    } catch {
      liveDomain = undefined;
    }

    let content = await getElementTextWithPuppeteer(
      page,
      config.selectors.content
    );
    if (content?.length <= 0) {
      throw new Error("Couldn't extract content");
    }

    content = normalizeContent(content);

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
          url: formatUrl(nextUrl, liveDomain, config.domain),
          title: `Chương ${currentNumber + 1}`,
        };
        prevChapter = {
          url: formatUrl(prevUrl, liveDomain, config.domain),
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
        nextChapter.url = formatUrl(nextChapter.url, liveDomain, config.domain);
        prevChapter.url = formatUrl(prevChapter.url, liveDomain, config.domain);
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
  html: string,
  liveDomain?: string
): Promise<StoryContent> => {
  const $ = cheerio.load(html);

  let content = extractText($, config.selectors.content);
  if (content.length <= 0) {
    throw new Error("Couldn't extract content");
  }
  content = normalizeContent(content);
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
        url: formatUrl(nextUrl, liveDomain, config.domain),
        title: `Chương ${currentNumber + 1}`,
      };
      prevChapter = {
        url: formatUrl(prevUrl, liveDomain, config.domain),
        title: `Chương ${currentNumber - 1}`,
      };
    }
  } else {
    nextChapter = extractChapterInfo($, config.selectors.nextChapter!.cheerio);
    prevChapter = extractChapterInfo($, config.selectors.prevChapter!.cheerio);
    nextChapter.url = formatUrl(nextChapter.url, liveDomain, config.domain);
    prevChapter.url = formatUrl(prevChapter.url, liveDomain, config.domain);
  }

  return {
    content: content + "\n" + ".Cách chương",
    currentChapter: { url, title },
    nextChapter,
    prevChapter,
  };
};

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
};

// axios (via the follow-redirects package) exposes the URL the request
// actually landed on after following any HTTP redirects. If the site has
// moved to a new domain/TLD, this is what we want to build subsequent
// chapter links from instead of the (possibly stale) config.domain, and what
// we register as a new alias so future requests resolve it directly.
const extractLiveDomain = (
  response: AxiosResponse,
  fallbackUrl: string
): string | undefined => {
  try {
    const finalUrl =
      (response.request as { res?: { responseUrl?: string } })?.res
        ?.responseUrl || fallbackUrl;
    return new URL(finalUrl).hostname;
  } catch {
    return undefined;
  }
};

const isRetryableWithPuppeteer = (err: unknown): boolean =>
  (axios.isAxiosError(err) && err.response?.status === 403) ||
  (err instanceof Error && err.message === "Couldn't extract content");

// Minimum amount of selected text required before we trust a selector
// "fingerprint" match on an unknown domain. Story chapters are long, so a
// real match should comfortably clear this; short matches are more likely
// to be a coincidental hit on unrelated boilerplate (nav, footer, etc.).
const MIN_FINGERPRINT_TEXT_LENGTH = 150;

/**
 * For a domain with no known config, tries every existing config's content +
 * title selectors against the fetched HTML. If exactly one config's
 * selectors both yield substantial text, we treat that as "this is probably
 * the same site under a new domain" - this is what lets a full rebrand
 * (not just a redirect) get picked up without recreating the config from
 * scratch.
 */
const guessConfigFromHtml = (
  html: string,
  configs: Record<string, ScraperConfig>
): { key: string; config: ScraperConfig } | undefined => {
  const $ = cheerio.load(html);

  for (const [key, config] of Object.entries(configs)) {
    try {
      const content = extractText($, config.selectors.content);
      const title = extractText($, config.selectors.title);

      if (
        content.trim().length >= MIN_FINGERPRINT_TEXT_LENGTH &&
        title.trim().length > 0
      ) {
        return { key, config };
      }
    } catch {
      // Selector might be invalid/throw on this page's markup - just skip it
      continue;
    }
  }

  return undefined;
};

const scrapeWithFallback = async (
  url: string,
  config: ScraperConfig,
  response: AxiosResponse,
  liveDomain: string | undefined
): Promise<StoryContent> => {
  try {
    console.log("get content with axios and cheerio");
    return await scrapeWithCheerio(url, config, response.data, liveDomain);
  } catch (err) {
    if (isRetryableWithPuppeteer(err)) {
      console.log(
        `[${new Date().toLocaleTimeString()}] get content with puppeteer`
      );
      return scrapeWithPuppeteer(url, config);
    }
    throw err;
  }
};

// Main function
export const getStoryContent = async (url: string): Promise<StoryContent> => {
  const domain = new URL(url).hostname;
  const resolved = await configService.resolveConfig(domain);

  if (resolved) {
    const { key, config } = resolved;

    let response: AxiosResponse;
    try {
      response = await axios.get(url, { headers: REQUEST_HEADERS });
    } catch (err) {
      if (isRetryableWithPuppeteer(err)) {
        console.log(
          `[${new Date().toLocaleTimeString()}] get content with puppeteer`
        );
        return scrapeWithPuppeteer(url, config);
      }
      throw err;
    }

    const liveDomain = extractLiveDomain(response, url);

    // The page actually resolved somewhere different than both the
    // requested domain and the config's stored domain (e.g. a redirect to
    // a brand new TLD) - remember it so next time it resolves directly.
    if (liveDomain) {
      configService.addDomainAlias(key, liveDomain).catch((err) => {
        log.error(`[AutoDetect] Failed to persist alias "${liveDomain}":`, err);
      });
    }

    return scrapeWithFallback(url, config, response, liveDomain);
  }

  // Unknown domain - fetch the page once and see if it matches an existing
  // config's selector fingerprint before giving up. This covers a full
  // rebrand/domain change that didn't go through an HTTP redirect (so the
  // dynamic-domain healing above never got a chance to run).
  let response: AxiosResponse;
  try {
    response = await axios.get(url, { headers: REQUEST_HEADERS });
  } catch {
    throw new Error(`Unsupported domain: ${domain}`);
  }

  const configs = await configService.getCachedConfigs();
  const guessed = guessConfigFromHtml(response.data, configs);

  if (!guessed) {
    throw new Error(`Unsupported domain: ${domain}`);
  }

  log.info(
    `[AutoDetect] New domain "${domain}" matches existing config "${guessed.key}" by selector fingerprint - registering as alias`
  );
  await configService.addDomainAlias(guessed.key, domain).catch((err) => {
    log.error(`[AutoDetect] Failed to persist alias "${domain}":`, err);
  });

  const liveDomain = extractLiveDomain(response, url);
  return scrapeWithFallback(url, guessed.config, response, liveDomain);
};
