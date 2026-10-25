import { useRouteContext } from "@tanstack/react-router";
import { blogConfig } from "@/blog.config";
import { clientEnv } from "@/lib/env/client.env";

const env = clientEnv();
export const classicConfig = {
  name: env.VITE_BLOG_NAME || "blog",
  theme: {
    default: {
      background: {
        homeImage: env.VITE_DEFAULT_HOME_IMAGE || "",
        globalImage: env.VITE_DEFAULT_GLOBAL_IMAGE || "",
        light: { opacity: env.VITE_DEFAULT_LIGHT_OPACITY ?? 0.15 },
        dark: { opacity: env.VITE_DEFAULT_DARK_OPACITY ?? 0.1 },
        backdropBlur: env.VITE_DEFAULT_BACKDROP_BLUR ?? 8,
        transitionDuration: env.VITE_DEFAULT_TRANSITION_DURATION ?? 600,
      },
    },
  },
};

export function useClassicConfig() {
  const { siteConfig } = useRouteContext({ from: "__root__" });
  return {
    ...blogConfig,
    ...classicConfig,
    title: siteConfig.title,
    author: siteConfig.author,
    description: siteConfig.description,
    social: {
      github:
        siteConfig.social.find((link) => link.platform === "github")?.url ||
        "https://github.com/yasingf",
      email: (
        siteConfig.social.find((link) => link.platform === "email")?.url ||
        "mailto:yasingfls@outlook.com"
      ).replace(/^mailto:/, ""),
    },
  };
}
