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
        className="space-y-6"
      >
        <h1 className="text-2xl font-medium">站长工具</h1>
        <SeoSection />
        <Button type="submit" disabled={!dirty || save.isPending}>
          保存设置
        </Button>
      </form>
    </FormProvider>
  );
}
