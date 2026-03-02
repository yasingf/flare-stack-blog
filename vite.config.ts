/*
 * @Author: error: error: git config user.name & please set dead value or install git && error: git config user.email & please set dead value or install git & please set dead value or install git
 * @Date: 2026-03-01 13:51:01
 * @LastEditors: error: error: git config user.name & please set dead value or install git && error: git config user.email & please set dead value or install git & please set dead value or install git
 * @LastEditTime: 2026-03-02 23:22:52
 * @FilePath: /flare-stack-blog/vite.config.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { alphaTab } from "@coderline/alphatab-vite";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig, loadEnv } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { z } from "zod";
import packageJson from "./package.json";

/**
 * alphaTab BeamingHelper 空值保护补丁。
 *
 * alphaTab 内部 BeamingHelper 类的 `beatOfHighestNote` / `beatOfLowestNote`
 * getter 直接访问 `this.highestNoteInHelper.beat`，当 beaming group 中
 * 只有休止符时 `highestNoteInHelper` 为 null，导致运行时崩溃。
 * 此 Vite 插件在构建/开发时对源码进行安全补丁，添加可选链。
 */
function alphaTabBeamingPatch(): Plugin {
  return {
    name: "alphatab-beaming-null-guard",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("alphaTab") || !id.endsWith(".mjs")) return null;
      // 只处理包含 BeamingHelper getter 的文件
      if (!code.includes("get beatOfHighestNote()")) return null;

      let patched = code;
      // 补丁1：beatOfLowestNote
      patched = patched.replace(
        /get beatOfLowestNote\(\)\s*\{\s*return this\.lowestNoteInHelper\.beat;\s*\}/,
        "get beatOfLowestNote() { return this.lowestNoteInHelper?.beat ?? this.beats[0]; }",
      );
      // 补丁2：beatOfHighestNote
      patched = patched.replace(
        /get beatOfHighestNote\(\)\s*\{\s*return this\.highestNoteInHelper\.beat;\s*\}/,
        "get beatOfHighestNote() { return this.highestNoteInHelper?.beat ?? this.beats[0]; }",
      );

      if (patched !== code) {
        return { code: patched, map: null };
      }
      return null;
    },
  };
}

import { themeNames, themes } from "./src/features/theme/registry";

const buildEnvSchema = z.object({
  THEME: z.enum(themeNames).catch("default"),
});

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const buildEnv = buildEnvSchema.parse(env);
  return {
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
      __THEME_CONFIG__: JSON.stringify(themes[buildEnv.THEME]),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@theme": path.resolve(
          __dirname,
          `src/features/theme/themes/${buildEnv.THEME}`,
        ),
      },
    },
    plugins: [
      alphaTabBeamingPatch(),
      alphaTab(),
      cloudflare({
        viteEnvironment: {
          name: "ssr",
        },
        // persistState: true,
        // remoteBindings: false,
      }),
      viteTsConfigPaths({
        projects: ["./tsconfig.json"],
      }),
      tailwindcss(),
      devtools(),
      tanstackStart(),
      viteReact(),
    ],
  };
});
export default config;
