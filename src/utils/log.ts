import { config} from "../config/env";

const isDevelopment = config.NODE_ENV === "development";

// Logging helpers
export const log = {
  dev: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  info: (...args: any[]) => {
    console.log(...args);
  },
  warn: (...args: any[]) => {
    console.warn(...args);
  },
  error: (...args: any[]) => {
    console.error(...args);
  }
};