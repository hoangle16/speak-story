import { db } from "../config/firebase";
import { ScraperConfig } from "../interfaces/scraper.interface";
import { log } from "../utils/log";

const CONFIG_REF = "ScraperConfig";

export const normalizeDomain = (domain: string): string =>
  domain.trim().toLowerCase().replace(/^www\./, "");

export const firstLabel = (domain: string): string =>
  normalizeDomain(domain).split(".")[0];

// In-memory cache of all configs plus a reverse lookup map (any known
// hostname / first-label / alias -> config key), kept warm by a Realtime DB
// listener so resolving a domain on every request doesn't need a network
// round trip.
let cachedConfigs: Record<string, ScraperConfig> | null = null;
let domainKeyMap: Map<string, string> | null = null;
let subscribed = false;

const buildDomainKeyMap = (
  configs: Record<string, ScraperConfig>
): Map<string, string> => {
  const map = new Map<string, string>();

  Object.entries(configs).forEach(([key, config]) => {
    map.set(key.toLowerCase(), key);

    if (config?.domain) {
      map.set(normalizeDomain(config.domain), key);
      map.set(firstLabel(config.domain), key);
    }

    (config?.aliases || []).forEach((alias) => {
      if (!alias) return;
      map.set(normalizeDomain(alias), key);
      map.set(firstLabel(alias), key);
    });
  });

  return map;
};

export const configService = {
  async getAllConfigs(): Promise<Record<string, ScraperConfig>> {
    try {
      const snapshot = await db.ref(CONFIG_REF).once("value");
      return snapshot.val() || {};
    } catch (error) {
      console.error("Failed to fetch configs:", error);
      throw new Error("Failed to fetch configs from database");
    }
  },
  async getConfig(key: string): Promise<ScraperConfig | undefined> {
    try {
      const snapshot = await db.ref(CONFIG_REF).child(key).once("value");
      return snapshot.val();
    } catch (error) {
      console.error(`Failed to fetch config ${key}:`, error);
      throw new Error("Failed to fetch config from database");
    }
  },
  async addConfig(key: string, config: ScraperConfig): Promise<void> {
    try {
      const snapshot = await db.ref(CONFIG_REF).child(key).once("value");
      if (snapshot.exists()) {
        throw new Error("Config already exists");
      }
      await db.ref(CONFIG_REF).child(key).set(config);
    } catch (error) {
      console.error("Failed to add config:", error);
      throw new Error("Failed to add config to database");
    }
  },
  async updateConfig(
    key: string,
    config: Partial<ScraperConfig>
  ): Promise<void> {
    try {
      const snapshot = await db.ref(CONFIG_REF).child(key).once("value");
      if (!snapshot.exists()) {
        throw new Error("Config not found");
      }
      await db.ref(CONFIG_REF).child(key).update(config);
    } catch (error) {
      console.error("Failed to update config:", error);
      throw new Error("Failed to update config in database");
    }
  },
  async removeConfig(key: string): Promise<boolean> {
    try {
      const snapshot = await db.ref(CONFIG_REF).child(key).once("value");
      if (!snapshot.exists()) {
        return false;
      }
      await db.ref(CONFIG_REF).child(key).remove();
      return true;
    } catch (error) {
      console.error(`Failed to delete config ${key}:`, error);
      throw new Error("Failed to delete config from database");
    }
  },

  subscribeToChanges(
    callback: (configs: Record<string, ScraperConfig>) => void
  ): void {
    db.ref(CONFIG_REF).on("value", (snapshot) => {
      callback(snapshot.val() || {});
    });
  },

  unsubscribeFromChanges(): void {
    db.ref(CONFIG_REF).off();
  },

  validateConfig(config: ScraperConfig): boolean {
    const hasChapterNumber =
      !!config.chapterNumber?.pattern?.regex &&
      !isNaN(config.chapterNumber.pattern.groupIndex);

    const hasSelectors = !!(
      config.selectors.nextChapter?.cheerio ||
      config.selectors.nextChapter?.puppeteer ||
      config.selectors.prevChapter?.cheerio ||
      config.selectors.prevChapter?.puppeteer
    );

    return !!(
      (
        config.domain &&
        config.selectors.content &&
        config.selectors.title &&
        hasChapterNumber !== hasSelectors
      ) // XOR CHECK
    );
  },

  // ---- Domain / alias resolution (cached) ----

  /** Keeps an in-memory cache of all configs warm via a realtime listener. */
  ensureSubscribed(): void {
    if (subscribed) return;
    subscribed = true;
    this.subscribeToChanges((configs) => {
      cachedConfigs = configs;
      domainKeyMap = buildDomainKeyMap(configs);
    });
  },

  async getCachedConfigs(): Promise<Record<string, ScraperConfig>> {
    this.ensureSubscribed();
    if (cachedConfigs) return cachedConfigs;

    const configs = await this.getAllConfigs();
    cachedConfigs = configs;
    domainKeyMap = buildDomainKeyMap(configs);
    return configs;
  },

  /** Resolves a hostname to a config key via exact domain, first-label, or alias match. */
  async resolveKey(hostname: string): Promise<string | undefined> {
    await this.getCachedConfigs();
    const map = domainKeyMap || new Map();
    return map.get(normalizeDomain(hostname)) || map.get(firstLabel(hostname));
  },

  async resolveConfig(
    hostname: string
  ): Promise<{ key: string; config: ScraperConfig } | undefined> {
    const key = await this.resolveKey(hostname);
    if (!key) return undefined;

    const configs = await this.getCachedConfigs();
    const config = configs[key];
    if (!config) return undefined;

    return { key, config };
  },

  /**
   * Registers `domain` as a known alias of the config at `key`, so future
   * requests resolve it directly without needing a redirect or a fresh
   * selector-fingerprint guess. Safe to call repeatedly - it's a no-op if
   * the domain is already the primary domain or an existing alias.
   */
  async addDomainAlias(key: string, domain: string): Promise<void> {
    const normalized = normalizeDomain(domain);
    const config = await this.getConfig(key);
    if (!config) return;

    const existingAliases = config.aliases || [];
    const alreadyKnown =
      normalizeDomain(config.domain) === normalized ||
      existingAliases.some((alias) => normalizeDomain(alias) === normalized);

    if (alreadyKnown) return;

    const aliases = [...existingAliases, normalized];

    try {
      await this.updateConfig(key, { aliases });
      log.info(`[ConfigService] Registered "${normalized}" as alias of "${key}"`);
    } catch (error) {
      log.error(`[ConfigService] Failed to register alias "${normalized}" for "${key}":`, error);
    }
  },
};
