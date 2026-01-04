/**
 * Shared cache for downloaded archive buffers
 */

const ARCHIVE_CACHE = new Map(); // subId -> { buffer, timestamp, archiveType, srtFiles }
const ARCHIVE_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

module.exports = {
  ARCHIVE_CACHE,
  ARCHIVE_CACHE_TTL,
};
