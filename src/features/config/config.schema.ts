import { z } from "zod";
import { blogConfig } from "@/blog.config";
import {
  type SiteConfigInput,
  SiteConfigInputSchema,
} from "@/features/config/site-config.schema";
import {
  legacyWebhookEndpointSchema,
  webhookEndpointSchema,
} from "@/features/webhook/webhook.schema";

export const SystemConfigSchema = z.object({
  seo: z
    .object({
      /** Google Search Console 验证码（meta tag content 值） */
      googleVerification: z.string().optional(),
      /** Bing Webmaster Tools 验证码 */
      bingVerification: z.string().optional(),
      /** 百度站长平台验证码 */
      baiduVerification: z.string().optional(),
      /** Bing Webmaster API Key（用于 URL 提交） */
      bingApiKey: z.string().optional(),
      /** 百度站长 Token（用于 URL 推送） */
      baiduPushToken: z.string().optional(),
      /** Google Indexing API JSON Key（base64 编码的 Service Account Key） */
      googleIndexingKey: z.string().optional(),
    })
    .optional(),
  email: z
    .object({
      apiKey: z.string().optional(),
      host: z.string().optional(),
      port: z.number().int().positive().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      senderName: z.string().optional(),
      senderAddress: z.union([z.email(), z.literal("")]).optional(),
    })
    .optional(),
  notification: z
    .object({
      admin: z
        .object({
          channels: z
            .object({
              email: z.boolean().optional(),
              webhook: z.boolean().optional(),
            })
            .optional(),
        })
        .optional(),
      user: z
        .object({
          emailEnabled: z.boolean().optional(),
        })
        .optional(),
      webhook: webhookEndpointSchema.optional(),
      webhooks: z.array(legacyWebhookEndpointSchema).optional(),
    })
    .optional(),
  site: SiteConfigInputSchema.optional(),
});

export type SystemConfig = z.infer<typeof SystemConfigSchema>;
export type { SiteConfig } from "@/features/config/site-config.schema";

export const DEFAULT_CONFIG: SystemConfig = {
  email: {
    host: "",
    port: 465,
    username: "",
    password: "",
    senderName: "",
    senderAddress: "",
  },
  notification: {
    admin: {
      channels: {
        email: true,
      },
    },
    user: {
      emailEnabled: true,
    },
    webhook: {
      url: "",
      secret: "",
    },
  },
  site: blogConfig satisfies SiteConfigInput,
};
