const manifest = {
  id: "org.stremio.subsro",
  version: "1.0.0",
  name: "Subs.ro Subtitles",
  description: "Romanian subtitles from Subs.ro (unofficial)",
  logo: "https://subs.ro/favicon.ico",
  catalogs: [],
  resources: ["subtitles"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],

  behaviorHints: {
    configurable: true,
    configurationRequired: true,
  },
};

module.exports = manifest;
