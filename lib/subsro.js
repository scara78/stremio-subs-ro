const axios = require("axios");

class SubsRoClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = "https://subs.ro/api/v1.0";
  }

  async searchByImdb(imdbId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/search/imdbid/${imdbId}`,
        {
          headers: { "X-Subs-Api-Key": this.apiKey },
        }
      );

      // The API returns { status, meta, count, items: [...] }
      // Or sometimes just the array if older version, but test showed 'items' key.
      const data = response.data;
      if (data && Array.isArray(data.items)) {
        return data.items;
      }
      return [];
    } catch (error) {
      console.error(`[SUBSRO] Search failed for ${imdbId}:`, error.message);
      return [];
    }
  }

  async validate() {
    try {
      // Search for a known movie (The Shawshank Redemption) to test the key
      // We do a direct call here because searchByImdb swallows errors
      await axios.get(`${this.baseUrl}/search/imdbid/tt0111161`, {
        headers: { "X-Subs-Api-Key": this.apiKey },
      });
      return true;
    } catch (error) {
      console.error(`[SUBSRO] Validation failed:`, error.message);
      return false;
    }
  }
}

module.exports = SubsRoClient;
