// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// This machine is often low on free RAM. Metro defaults to one worker per
// CPU core, which can exhaust memory mid-bundle and crash the dev server.
// Capping workers keeps the memory footprint low at a small speed cost.
config.maxWorkers = 2;

module.exports = config;
