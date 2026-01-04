const fuzz = require("fuzzball");

/**
 * Extract the release group from a filename.
 * Conventionally, this is the part after the last dash (e.g., Title-GROUP.mkv)
 */
function getReleaseGroup(filename) {
  if (!filename) return null;

  const name = filename.replace(/\.[a-zA-Z0-9]+$/, "").toLowerCase();

  // Pattern 1: Group after dash, potentially before brackets/tags or at end
  // e.g. "Movie.Title-GROUP.mkv" -> GROUP
  const dashMatch = name.match(/-([a-z0-9]+)(?:[\[\s]|$)/);
  if (dashMatch) return dashMatch[1].toUpperCase();

  // Pattern 2: Brackets at start or end
  // e.g. "[GROUP] Movie Title" or "Movie Title [GROUP]"
  const bracketMatch = name.match(/^\[([a-z0-9.]+)\]|\[([a-z0-9.]+)\]$/);
  if (bracketMatch) return (bracketMatch[1] || bracketMatch[2]).toUpperCase();

  // Pattern 3: Heuristic - check the last 2 words if they aren't technical tags
  const words = name
    .replace(/[.\-_[\]()]/g, " ")
    .trim()
    .split(/\s+/);
  const ignored = [
    "REMUX",
    "BLURAY",
    "BDRIP",
    "BRRIP",
    "WEB-DL",
    "WEBRip",
    "WEBDL",
    "HDRIP",
    "DVDRIP",
    "HDTV",
    "PDTV",
    "CAM",
    "TS",
    "TC",
    "SCR",
    "1080P",
    "720P",
    "2160P",
    "4K",
    "UHD",
    "HDR",
    "DV",
    "X264",
    "H264",
    "X265",
    "HEVC",
    "AAC",
    "DDP5",
    "DDP2",
    "DD5",
    "AC3",
    "DTS",
    "INTERNAL",
    "REPACK",
    "PROPER",
    "LIMITED",
    "MULTI",
    "SUBS",
    "RO",
    "EN",
  ];

  for (let i = words.length - 1; i >= Math.max(0, words.length - 2); i--) {
    const word = words[i].toUpperCase();
    if (!ignored.includes(word) && !/^\d{4}$/.test(word) && word.length >= 2) {
      return word;
    }
  }

  return null;
}

/**
 * Extract quality/source tags from a filename.
 */
function getQualityTags(filename) {
  if (!filename) return [];
  const tags = [
    "REMUX",
    "BluRay",
    "BDRip",
    "BRRip",
    "WEB-DL",
    "WEBRip",
    "WEBDL",
    "HDRip",
    "DVDRip",
    "HDTV",
    "PDTV",
    "CAM",
    "TS",
    "TC",
    "SCR",
  ];
  const found = [];
  const normalized = filename.toUpperCase();
  for (const tag of tags) {
    if (normalized.includes(tag.toUpperCase())) found.push(tag.toUpperCase());
  }
  return found;
}

/**
 * Calculate weighted match score between video filename and subtitle filename.
 * Based on industry research: Group + Source are primary sync indicators.
 *
 * Scoring (0-100 bounded):
 * - Release Group Match: +50
 * - Source Type Match: +30
 * - Title Fuzzy Similarity: 0-20 (capped, tiebreaker only)
 *
 * @param {string} videoFilename - The video file name
 * @param {string} subtitleFilename - The subtitle file name
 * @returns {number} - Weighted score (0-100)
 */
function calculateMatchScore(videoFilename, subtitleFilename) {
  if (!videoFilename || !subtitleFilename) return 0;

  const vGroup = getReleaseGroup(videoFilename);
  const vTags = getQualityTags(videoFilename);
  const sGroup = getReleaseGroup(subtitleFilename);
  const subNormalized = subtitleFilename.toUpperCase();

  let score = 0;

  // 1. Release Group Match (+50) - Primary sync indicator
  const hasGroupMatch =
    (vGroup && sGroup && vGroup === sGroup) ||
    (vGroup && subNormalized.includes(vGroup));
  if (hasGroupMatch) {
    score += 50;
  }

  // 2. Source Type Match (+30) - Secondary sync indicator
  const hasSourceMatch = vTags.some((tag) => subNormalized.includes(tag));
  if (hasSourceMatch) {
    score += 30;
  }

  // 3. Title Fuzzy Similarity (0-20) - Tiebreaker only
  // Cap at 20 since we already filter by IMDB ID
  const fuzzyScore = fuzz.token_set_ratio(
    videoFilename.toLowerCase(),
    subtitleFilename.toLowerCase()
  );
  score += Math.min(20, Math.round(fuzzyScore * 0.2));

  return Math.min(100, score);
}

/**
 * Calculate token-based similarity between two strings.
 * Uses token_set_ratio which handles word reordering and partial matches.
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity score 0-100
 */
function tokenSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  return fuzz.token_set_ratio(str1.toLowerCase(), str2.toLowerCase());
}

/**
 * Find the best matching string from a list of candidates.
 * @param {string} target - The target string to match against
 * @param {string[]} candidates - Array of candidate strings
 * @returns {{ match: string, score: number, index: number } | null}
 */
function findBestMatch(target, candidates) {
  if (!target || !candidates || candidates.length === 0) return null;

  let bestMatch = null;
  let bestScore = 0;
  let bestIndex = -1;

  candidates.forEach((candidate, index) => {
    const score = tokenSimilarity(target, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
      bestIndex = index;
    }
  });

  return bestScore > 0
    ? { match: bestMatch, score: bestScore, index: bestIndex }
    : null;
}

/**
 * Check if a text contains a specific season/episode pattern.
 * Matches: S01E05, S1E5, 1x05, E05, Ep.5, Episode 5, etc.
 * @param {string} text - Text to search in (title, description, filename)
 * @param {number} season - Season number
 * @param {number} episode - Episode number
 * @returns {boolean}
 */
function matchesEpisode(text, season, episode) {
  if (!text || episode === undefined || episode === null) return false;

  const normalizedText = text.toLowerCase();
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  const sShort = String(season);
  const eShort = String(episode);

  // Check if text contains ANY season indicator (S##E##, #x##, Season #, etc.)
  const seasonIndicatorRegex =
    /s\d+e\d+|\d+x\d+|(?:season|sezon|stagione|saison|staffel|évad|κύκλος|temporada)\s*\d+/i;
  const hasSeasonInText = seasonIndicatorRegex.test(normalizedText);

  if (hasSeasonInText) {
    // TEXT HAS SEASON: Require exact season+episode match
    const strictPatterns = [
      // S01E05 format
      new RegExp(`s${s}e${e}\\b`, "i"),
      new RegExp(`s${sShort}e${eShort}\\b`, "i"),
      new RegExp(`s${s}e${eShort}\\b`, "i"),
      new RegExp(`s${sShort}e${e}\\b`, "i"),
      // 1x05 format
      new RegExp(`\\b${sShort}x${e}\\b`, "i"),
      new RegExp(`\\b${sShort}x${eShort}\\b`, "i"),
      new RegExp(`\\b${s}x${e}\\b`, "i"),
    ];

    // Multi-language "Season X Episode Y" style
    const seasonKeywords =
      "(?:season|sezon|stagione|saison|staffel|évad|κύκλος|temporada)";
    const episodeKeywords =
      "(?:episode|episod|episodio|épisode|folge|epizód|επεισόδιο|episódio)";
    strictPatterns.push(
      new RegExp(
        `${seasonKeywords}\\s*${sShort}.*?${episodeKeywords}\\s*${eShort}`,
        "i"
      ),
      new RegExp(`${seasonKeywords}\\s*${s}.*?${episodeKeywords}\\s*${e}`, "i")
    );

    return strictPatterns.some((pattern) => pattern.test(normalizedText));
  } else {
    // TEXT HAS NO SEASON: Allow episode-only match (for anime, etc.)
    const episodeOnlyPatterns = [
      new RegExp(`\\be${e}\\b`, "i"),
      new RegExp(`\\be${eShort}\\b`, "i"),
      new RegExp(`\\bep\\.?\\s*${eShort}\\b`, "i"),
      new RegExp(`\\bep\\.?\\s*${e}\\b`, "i"),
      new RegExp(
        `\\b(?:episode|episod|episodio|épisode|folge|epizód|επεισόδιο|episódio)\\s*${eShort}\\b`,
        "i"
      ),
      new RegExp(
        `\\b(?:episode|episod|episodio|épisode|folge|epizód|επεισόδιο|episódio)\\s*${e}\\b`,
        "i"
      ),
      // Also match "-04" or ".04" or "_04" patterns common in anime
      new RegExp(`[\\-\\._\\s]${e}[\\-\\._\\s\\[]`, "i"),
    ];

    return episodeOnlyPatterns.some((pattern) => pattern.test(normalizedText));
  }
}

/**
 * Extract season and episode from various text formats.
 * @param {string} text - Text to parse
 * @returns {{ season: number, episode: number } | null}
 */
function extractSeasonEpisode(text) {
  if (!text) return null;

  const patterns = [
    /s(\d{1,2})e(\d{1,2})/i, // S01E05
    /(\d{1,2})x(\d{1,2})/i, // 1x05
    // Universal pattern for Season X Episode Y
    /(?:season|sezon|stagione|saison|staffel|évad|κύκλος|temporada)\s*(\d+).*?(?:episode|episod|episodio|épisode|folge|epizód|επεισόδιο|episódio)\s*(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        season: parseInt(match[1], 10),
        episode: parseInt(match[2], 10),
      };
    }
  }

  return null;
}

module.exports = {
  matchesEpisode,
  calculateMatchScore,
};
