/**
 * @name Subs.ro Rate Limiter
 * @description Queue-based API rate limiting with SEPARATE queues per endpoint.
 * Search: 1 request/second (sequential)
 * Download: Up to 3 concurrent requests with 200ms stagger
 */

const axios = require("axios");

// Timestamp helper
const ts = () => new Date().toISOString().slice(11, 23);

class SubsRoRateLimiter {
  constructor() {
    this.queues = {
      search: {
        queue: [],
        processing: false,
        lastRequest: 0,
        interval: 1000, // 1 request per second
      },
      download: {
        queue: [],
        activeCount: 0,
        maxConcurrent: 3, // Allow 3 parallel downloads
        staggerMs: 200, // 200ms between starting each download
        lastStart: 0,
      },
    };

    this.timeout = 30000;
    this.maxRetries = 2;

    // Process search queue (sequential)
    setInterval(() => this.processSearchQueue(), 100);
    // Process download queue (parallel with stagger)
    setInterval(() => this.processDownloadQueue(), 50);
  }

  /**
   * Clear all pending requests (call when user switches titles)
   */
  clearQueues() {
    const searchPending = this.queues.search.queue.length;
    const downloadPending = this.queues.download.queue.length;

    this.queues.search.queue.forEach((req) =>
      req.reject(new Error("Request cancelled"))
    );
    this.queues.download.queue.forEach((req) =>
      req.reject(new Error("Request cancelled"))
    );

    this.queues.search.queue = [];
    this.queues.download.queue = [];

    if (searchPending > 0 || downloadPending > 0) {
      console.log(
        `[${ts()}] [RateLimiter] Cleared queues [S=${searchPending}, D=${downloadPending}]`
      );
    }
  }

  async searchRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      this.queues.search.queue.push({
        url,
        options,
        resolve,
        reject,
        retries: 0,
      });
    });
  }

  async downloadArchive(url, options = {}) {
    return new Promise((resolve, reject) => {
      this.queues.download.queue.push({
        url,
        options: { ...options, responseType: "arraybuffer" },
        resolve,
        reject,
        retries: 0,
      });
    });
  }

  /**
   * Process search queue (sequential, 1/sec)
   */
  async processSearchQueue() {
    const config = this.queues.search;
    if (config.queue.length === 0 || config.processing) return;

    const now = Date.now();
    if (now - config.lastRequest < config.interval) return;

    config.processing = true;
    config.lastRequest = now;

    const request = config.queue.shift();
    try {
      await this.executeRequest(request, "SEARCH");
    } finally {
      config.processing = false;
    }
  }

  /**
   * Process download queue (parallel with stagger)
   */
  async processDownloadQueue() {
    const config = this.queues.download;
    if (config.queue.length === 0) return;
    if (config.activeCount >= config.maxConcurrent) return;

    const now = Date.now();
    if (now - config.lastStart < config.staggerMs) return;

    config.lastStart = now;
    config.activeCount++;

    const request = config.queue.shift();

    // Execute without blocking the loop
    this.executeRequest(request, "DOWNLOAD").finally(() => {
      config.activeCount--;
    });
  }

  async executeRequest(request, queueName) {
    const { url, options, resolve, reject, retries } = request;
    const logPrefix = `[${ts()}] [RateLimiter] [${queueName}]`;

    try {
      const response = await axios.get(url, {
        ...options,
        timeout: this.timeout,
        maxContentLength: 10 * 1024 * 1024,
      });

      resolve(response.data);
    } catch (error) {
      const status = error.response?.status;
      const body = error.response?.data;
      const retryAfter = error.response?.headers?.["retry-after"];
      const isTransient =
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT" ||
        error.code === "ECONNABORTED";

      if (isTransient && retries < this.maxRetries) {
        console.warn(
          `${logPrefix} [${error.code}] Retrying (${retries + 1}/${
            this.maxRetries
          })...`
        );
        request.retries = retries + 1;
        // Re-add to front based on queue type
        if (queueName === "SEARCH") {
          this.queues.search.queue.unshift(request);
        } else {
          this.queues.download.queue.unshift(request);
        }
        return;
      }

      if (status === 429) {
        console.error(
          `${logPrefix} [429 RATE LIMITED] Retry-After: ${
            retryAfter || "not specified"
          }`
        );
      } else if (status === 401) {
        console.error(`${logPrefix} [401 UNAUTHORIZED] Invalid API key`);
      } else if (isTransient) {
        console.error(
          `${logPrefix} [${error.code}] ${error.message} (retries exhausted)`
        );
      } else {
        console.error(
          `${logPrefix} [ERROR ${status || error.code}] ${error.message}`
        );
      }

      console.error(`${logPrefix} URL: ${url}`);
      if (body) console.error(`${logPrefix} Body: ${JSON.stringify(body)}`);

      reject(error);
    }
  }

  getQueueStatus() {
    return {
      search: this.queues.search.queue.length,
      download: this.queues.download.queue.length,
      activeDownloads: this.queues.download.activeCount,
    };
  }
}

const globalLimiter = new SubsRoRateLimiter();

module.exports = {
  SubsRoRateLimiter,
  globalLimiter,
};
