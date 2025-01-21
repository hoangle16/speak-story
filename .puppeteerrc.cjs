const { join } = require("path");

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer.
  cacheDirectory:
    process.env.NODE_ENV === "production"
      ? join(__dirname, ".cache", "puppeteer")
      : undefined,
};
