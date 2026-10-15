const path = require("path");

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    overrides: [
      {
        test(filename) {
          if (!filename) return false;
          const relative = path.relative(__dirname, filename).replace(/\\/g, "/");
          if (relative.startsWith("..")) return false;
          return relative.startsWith("app/") || relative.startsWith("src/");
        },
        presets: ["nativewind/babel"]
      }
    ],
    plugins: ["react-native-worklets/plugin"]
  };
};
