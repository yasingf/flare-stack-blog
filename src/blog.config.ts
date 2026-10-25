import { clientEnv } from "@/lib/env/client.env";
import type { SiteConfig } from "@/features/config/site-config.schema";

const env = clientEnv();

export const blogConfig = {
  title: env.VITE_BLOG_TITLE || "Yasin's Blog",
  author: env.VITE_BLOG_AUTHOR || "Yasin",
  description: env.VITE_BLOG_DESCRIPTION || "一些教程，吉他谱和个人的碎碎念",
  social: [
    {
      platform: "github",
      url: env.VITE_BLOG_GITHUB || "https://github.com/yasingf",
    },
    {
      platform: "email",
      url: `mailto:${env.VITE_BLOG_EMAIL || "yasingfls@outlook.com"}`,
    },
    { platform: "rss", url: "/rss.xml" },
  ],
  navLinks: env.VITE_ENABLE_GUITAR_TABS
    ? [{ label: "吉他谱", href: "/guitar-tabs" }]
    : [],
  icons: {
    faviconSvg: "/favicon.svg",
    faviconIco: "/favicon.ico",
    favicon96: "/favicon-96x96.png",
    appleTouchIcon: "/apple-touch-icon.png",
    webApp192: "/web-app-manifest-192x192.png",
    webApp512: "/web-app-manifest-512x512.png",
  },
  theme: {
    fuwari: {
      homeBg: env.VITE_FUWARI_HOME_BG || "/images/home-bg.webp",
      avatar: env.VITE_FUWARI_AVATAR || "/images/avatar.png",
      primaryHue: 250,
    },
  },
} as const satisfies SiteConfig;
