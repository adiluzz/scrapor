import pino from "pino";

/**
 * Structured JSON logger. In containers this writes JSON lines to stdout,
 * which the Docker json-file driver captures and filebeat ships to ELK.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service: "web" },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
