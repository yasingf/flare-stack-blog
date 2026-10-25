import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";
import "@/features/piano/piano.css";

export const Route = createFileRoute("/_public/piano")({
  head: () => ({
    meta: [
      { title: "钢琴练习室 · Yasin's Blog" },
      {
        name: "description",
        content:
          "导入 MIDI 与 MusicXML，查看指法和符号解释，用真实钢琴音色、瀑布流与 MIDI 跟弹练习。",
      },
    ],
  }),
  component: PianoPage,
});
function PianoPage() {
  const [Room, setRoom] = useState<ComponentType | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (import.meta.env.SSR) return;
    let mounted = true;
    void import("@/features/piano/components/piano-room")
      .then((module) => {
        if (mounted) setRoom(() => module.default);
      })
      .catch(() => setError(true));
    return () => {
      mounted = false;
    };
  }, []);
  return Room ? (
    <Room />
  ) : (
    <section className="piano-room">
      <h1>钢琴练习室</h1>
      <p role="status">
        {error ? "练习室加载失败，请刷新页面重试。" : "正在打开练习室…"}
      </p>
      <noscript>钢琴看谱、音频播放和 MIDI 跟弹需要启用 JavaScript。</noscript>
    </section>
  );
}
