import config from "@lattelink/config-eslint";

export default [
  ...config,
  {
    files: ["scripts/**/*.mjs", "test/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        URL: "readonly",
        console: "readonly",
        process: "readonly"
      }
    },
    rules: {
      "no-console": "off"
    }
  }
];
