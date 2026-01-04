const { globalLimiter } = require("./rateLimiter");

class SubsRoClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = "https://subs.ro/api/v1.0";
  }

  async searchByImdb(imdbId) {
    try {
      const url = `${this.baseUrl}/search/imdbid/${imdbId}`;
      // Use the SEARCH queue (1 request/second)
      const data = await globalLimiter.searchRequest(url, {
        headers: { "X-Subs-Api-Key": this.apiKey },
      });

      if (data && Array.isArray(data.items)) {
        return data.items;
      }
      return [];
    } catch (error) {
      // Errors are already logged explicitly by RateLimiter
      return [];
    }
  }

  async validate() {
    try {
      const url = `${this.baseUrl}/quota`;
      // Use the SEARCH queue for validation too
      const data = await globalLimiter.searchRequest(url, {
        headers: { "X-Subs-Api-Key": this.apiKey },
      });
      return data?.quota?.remaining_quota >= 0;
    } catch (error) {
      return false;
    }
  }
}

module.exports = SubsRoClient;
