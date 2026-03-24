import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        en: resolve(__dirname, "index-en.html"),
        legalFr: resolve(__dirname, "mentions-legales.html"),
        privacyFr: resolve(__dirname, "politique-confidentialite.html"),
        legalEn: resolve(__dirname, "legal-notice.html"),
        privacyEn: resolve(__dirname, "privacy-policy.html"),
      },
    },
  },
});
