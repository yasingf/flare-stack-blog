import { orpcClient } from "@/lib/orpc";

export const getSiteUrlsFn = () => orpcClient.seo.urls();
export const submitUrlsToSearchEnginesFn = ({
  data,
}: {
  data: { urls: Array<string> };
}) => orpcClient.seo.submit(data);
