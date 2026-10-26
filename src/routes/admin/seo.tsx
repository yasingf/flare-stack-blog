import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SeoSection } from "@/features/config/components/seo-section";
import type { SystemConfig } from "@/features/config/config.schema";
import { orpc, orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/admin/seo")({
  loader: () => ({ title: "站长工具" }),
  head: () => ({ meta: [{ title: "站长工具" }] }),
  component: SeoPage,
  ssr: false,
});

function SeoPage() {
  const queryClient = useQueryClient();
  const query = orpc.seo.get.queryOptions();
  const { data, isPending, isError } = useQuery(query);
  const baseline = useRef(data);
  const form = useForm<SystemConfig>({ defaultValues: { seo: {} } });
  const dirty = form.formState.isDirty;
  useEffect(() => {
    if (data && !dirty) {
      form.reset({ seo: data.seo });
      baseline.current = data;
    }
  }, [data, dirty, form]);
  const save = useMutation({
    mutationFn: async (config: SystemConfig) => {
      if (!baseline.current) throw new Error("设置尚未加载");
      return orpcClient.seo.save({ ...baseline.current, seo: config.seo });
    },
    onSuccess: async () => {
      form.reset(form.getValues());
      await queryClient.invalidateQueries({ queryKey: query.queryKey });
      toast.success("站长工具设置已保存");
    },
    onError: (error) => toast.error(error.message),
  });
  if (isPending) return <p>正在加载设置…</p>;
  if (isError) return <p role="alert">设置加载失败，请刷新重试。</p>;
  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit((value) => save.mutate(value))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <header className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 bg-background pb-6">
          <h1 className="text-2xl font-medium">站长工具</h1>
          <Button type="submit" disabled={!dirty || save.isPending}>
            {save.isPending ? "正在保存…" : "保存设置"}
          </Button>
        </header>
        <div
          role="region"
          aria-label="站长工具配置与 URL 提交"
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-2 pb-2"
        >
          <SeoSection />
        </div>
      </form>
    </FormProvider>
  );
}
