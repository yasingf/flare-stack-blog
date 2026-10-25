// Compatibility for the fork's UI; all requests now use the shared oRPC API.
import { orpcClient } from "@/lib/orpc";

export const getGuitarTabsFn = ({
  data,
}: {
  data: { page?: number; pageSize?: number; search?: string };
}) => orpcClient.guitarTabs.list(data);
export const getApprovedGuitarTabsCountFn = () => orpcClient.guitarTabs.count();
export const getGuitarTabBySlugFn = ({ data }: { data: { slug: string } }) =>
  orpcClient.guitarTabs.detail(data);
export const getGuitarTabMetaFn = ({ data }: { data: { mediaId: number } }) =>
  orpcClient.guitarTabs.admin.meta(data);
export const getGuitarTabsAdminFn = ({
  data,
}: {
  data: {
    cursor?: number;
    limit?: number;
    search?: string;
    status?: "pending" | "approved" | "rejected";
  };
}) => orpcClient.guitarTabs.admin.list(data);
export const reviewGuitarTabFn = ({
  data,
}: {
  data: {
    mediaId: number;
    status: "approved" | "rejected";
    rejectionReason?: string;
  };
}) => orpcClient.guitarTabs.admin.review(data);
export const processUnparsedGuitarTabsFn = () =>
  orpcClient.guitarTabs.admin.process();
export const fetchMissingCoversFn = () => orpcClient.guitarTabs.admin.covers();
export const getMyGuitarTabsFn = () => orpcClient.guitarTabs.mine();
export const submitGuitarTabFn = ({ data }: { data: FormData }) => {
  const file = data.get("file");
  if (!(file instanceof File)) throw new Error("请选择吉他谱文件");
  return orpcClient.guitarTabs.submit({ file });
};
