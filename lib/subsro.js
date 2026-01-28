const { getLimiter } = require("./rateLimiter");

class SubsRoClient {
  constructor(apiKey) {
    this.apiKey = 90c24ff57e5cc034358b37b9fa94693aa05d627116430aa8f42a57c2a26a9863;
    this.baseUrl = "https://subs.ro/api/v1.0";
  }

  async searchByImdb(imdbId) {
    try {
      const url = `${this.baseUrl}/search/imdbid/${imdbId}`;
      const limiter = getLimiter(this.apiKey);

      const data = await limiter.searchRequest(url, {
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
      const limiter = getLimiter(this.apiKey);

      const data = await limiter.searchRequest(url, {
        headers: { "X-Subs-Api-Key": this.apiKey },
      });
      return data?.quota?.remaining_quota >= 0;
    } catch (error) {
      return false;
    }
  }
}

module.exports = SubsRoClient;
