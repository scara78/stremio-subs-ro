const express = require("express");
const iconv = require("iconv-lite");
const jschardet = require("jschardet");
const {
  extractSrtFile,
  getArchiveType,
  listSrtFiles,
} = require("./archiveUtils");
const { globalLimiter } = require("./rateLimiter");
const { ARCHIVE_CACHE, ARCHIVE_CACHE_TTL } = require("./archiveCache");
const router = express.Router();

const VTT_CACHE = new Map(); // cacheKey -> { vtt, timestamp }
const VTT_TTL = 12 * 60 * 60 * 1000; // 12 hours

// Route: /:apiKey/proxy/:subId/:encodedSrtPath/sub.vtt
router.get(
  "/:apiKey/proxy/:subId/:encodedSrtPath/sub.vtt",
  async (req, res) => {
    const { apiKey, subId, encodedSrtPath } = req.params;

    if (!/^\d+$/.test(subId)) {
      return res.status(400).send("Invalid subtitle ID");
    }

    let srtPath = "";
    try {
      srtPath = Buffer.from(encodedSrtPath, "base64url").toString("utf-8");
    } catch (e) {
      return res.status(400).send("Invalid SRT path encoding");
    }

    const vttCacheKey = `${subId}_${encodedSrtPath}`;
    const cachedVtt = VTT_CACHE.get(vttCacheKey);
    if (cachedVtt && Date.now() - cachedVtt.timestamp < VTT_TTL) {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Content-Type", "text/vtt; charset=utf-8");
      res.set("Cache-Control", "public, max-age=43200");
      return res.send(cachedVtt.vtt);
    }

    try {
      let archiveBuffer;
      let archiveType;
      const cacheKey = `archive_${subId}`;
      const cachedArchive = ARCHIVE_CACHE.get(cacheKey);

      if (
        cachedArchive &&
        Date.now() - cachedArchive.timestamp < ARCHIVE_CACHE_TTL
      ) {
        archiveBuffer = cachedArchive.buffer || cachedArchive.data; // support both formats
        archiveType = cachedArchive.archiveType;
        // If we only have srtFiles but no buffer, we must re-download
        if (!archiveBuffer) cachedArchive = null;
      }

      if (!cachedArchive) {
        const downloadUrl = `https://subs.ro/api/v1.0/subtitle/${subId}/download`;
        // Use rate limiter
        archiveBuffer = await globalLimiter.downloadArchive(downloadUrl, {
          headers: { "X-Subs-Api-Key": apiKey },
        });
        archiveType = getArchiveType(archiveBuffer);
        const srtFiles = await listSrtFiles(archiveBuffer);

        // Store in shared cache
        ARCHIVE_CACHE.set(cacheKey, {
          buffer: archiveBuffer,
          archiveType,
          srtFiles,
          timestamp: Date.now(),
        });
      }

      console.log(
        `[PROXY] Extracting "${srtPath}" from ${archiveType.toUpperCase()} archive`
      );

      const contentBuffer = await extractSrtFile(archiveBuffer, srtPath);

      if (!contentBuffer) {
        return res.status(404).send("SRT file not found in archive");
      }

      const detected = jschardet.detect(contentBuffer);
      let encoding = detected.encoding || "utf-8";
      if (
        encoding.toLowerCase().includes("windows-1252") ||
        detected.confidence < 0.8
      ) {
        encoding = "windows-1250";
      }

      let contentStr = iconv.decode(contentBuffer, encoding);
      contentStr =
        "WEBVTT\n\n" +
        contentStr
          .replace(/\r\n/g, "\n")
          .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");

      VTT_CACHE.set(vttCacheKey, { vtt: contentStr, timestamp: Date.now() });

      res.set("Access-Control-Allow-Origin", "*");
      res.set("Content-Type", "text/vtt; charset=utf-8");
      res.set("Cache-Control", "public, max-age=43200");
      res.send(contentStr);
    } catch (error) {
      // Errors are already logged by globalLimiter
      res
        .status(error.response?.status || 500)
        .send(error.response?.data || "Proxy error");
    }
  }
);

module.exports = router;
