import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          web3: ["wagmi", "viem", "@tanstack/react-query"],
          icons: ["lucide-react"],
        },
      },
      onwarn(warning, warn) {
        if (
          warning.code === "INVALID_ANNOTATION" &&
          typeof warning.id === "string" &&
          warning.id.includes("/node_modules/ox/")
        ) {
          return;
        }

        warn(warning);
      },
    },
  },
});
