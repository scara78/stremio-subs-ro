const { addonBuilder } = require("stremio-addon-sdk");
const SubsRoClient = require("./lib/subsro");
const manifest = require("./manifest");

const builder = new addonBuilder(manifest);

// --- CACHE SYSTEM ---
const CACHE = new Map(); // IMDB_ID -> { data, timestamp, ttl }
const PENDING_REQUESTS = new Map(); // IMDB_ID -> Promise
const CLIENT_CACHE = new Map(); // apiKey -> SubsRoClient instance
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes (Standard navigation cache)
const EMPTY_CACHE_TTL = 60 * 1000; // 1 minute for "no results"

// Get or create cached client instance
const getClient = (apiKey) => {
  if (!CLIENT_CACHE.has(apiKey)) {
    CLIENT_CACHE.set(apiKey, new SubsRoClient(apiKey));
  }
  return CLIENT_CACHE.get(apiKey);
};

const LANGUAGE_MAPPING = {
  // subs.ro code -> ISO 639-2 (Stremio expects)
  ro: "ron", // Romanian (ISO 639-2)
  en: "eng", // English
  ita: "ita", // Italian
  fra: "fra", // French
  ger: "deu", // German (ISO 639-2)
  ung: "hun", // Hungarian
  gre: "ell", // Greek (Modern, ISO 639-2)
  por: "por", // Portuguese
  spa: "spa", // Spanish
  alt: "und", // Undetermined (for "other")
};

const subtitlesHandler = async ({ type, id, config }) => {
  if (!config || !config.apiKey) return { subtitles: [] };

  const imdbId = id.split(":")[0];
  const cacheKey = `${imdbId}_${config.languages || "all"}`;

  // 1. Check Cache
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return { subtitles: cached.data };
  }

  // 2. Debounce Pending Requests
  if (PENDING_REQUESTS.has(cacheKey)) {
    return PENDING_REQUESTS.get(cacheKey);
  }

  const fetchTask = (async () => {
    try {
      const subsRo = getClient(config.apiKey);
      const results = await subsRo.searchByImdb(imdbId);

      // Filter
      let filtered = results;
      if (config.languages && config.languages.length > 0) {
        filtered = results.filter((sub) =>
          config.languages.includes(sub.language)
        );
      }

      // Map
      const baseUrl =
        config.baseUrl || process.env.BASE_URL || "http://localhost:7000";
      const subtitles = filtered.map((sub) => ({
        id: `subsro_${sub.id}`,
        url: `${baseUrl}/${config.apiKey}/proxy/${sub.id}/sub.vtt`,
        lang: LANGUAGE_MAPPING[sub.language] || sub.language,
      }));

      // Store in Cache
      CACHE.set(cacheKey, {
        data: subtitles,
        timestamp: Date.now(),
        ttl: subtitles.length > 0 ? CACHE_TTL : EMPTY_CACHE_TTL,
      });

      console.log(
        `[SUBS] Served ${subtitles.length} subs for ${imdbId} (Cache: MISS)`
      );
      return { subtitles };
    } catch (error) {
      console.error(`[SUBS] Error for ${imdbId}:`, error.message);
      return { subtitles: [] };
    } finally {
      PENDING_REQUESTS.delete(cacheKey);
    }
  })();

  PENDING_REQUESTS.set(cacheKey, fetchTask);
  return fetchTask;
};

builder.defineSubtitlesHandler(subtitlesHandler);

module.exports = {
  builder,
  addonInterface: builder.getInterface(),
  subtitlesHandler,
};
