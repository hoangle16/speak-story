import { db } from "../config/firebase";
import { ScraperConfig } from "../interfaces/scraper.interface";

const CONFIG_REF = "ScraperConfig";

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
  async updateConfig(key: string, config: ScraperConfig): Promise<void> {
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
    return !!(
      config.domain &&
      config.selectors &&
      config.selectors.content &&
      config.selectors.title &&
      config.selectors.title &&
      config.selectors.nextChapter &&
      config.selectors.prevChapter
    );
  },
};
