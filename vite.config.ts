import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter(),
      csrf: { trustedOrigins: ["*"] }
    })
  ],
  ssr: { noExternal: ["bits-ui", "sveltekit-superforms"] },
  server: { port: 3009, watch: { ignored: ["./data/**"] } }
});
