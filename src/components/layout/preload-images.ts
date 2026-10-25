import { classicConfig } from "./classic/classic-config";
import type { SiteConfig } from "@/features/config/site-config.schema";
export function getHomeBackgroundPreloadImages(
  _siteConfig: SiteConfig,
): Array<string> {
  return [
    classicConfig.theme.default.background.homeImage,
    classicConfig.theme.default.background.globalImage,
  ].filter(Boolean);
}
