import { createFileRoute } from "@tanstack/react-router";
import { SharedLibrary } from "@/features/piano/components/shared-library";
import "@/features/piano/piano.css";

export const Route = createFileRoute("/admin/piano")({
  loader: () => ({ title: "钢琴谱管理" }),
  head: () => ({ meta: [{ title: "钢琴谱管理" }] }),
  component: () => (
    <div className="piano-room piano-admin">
      <header className="piano-room-heading">
        <div>
          <h1>钢琴谱管理</h1>
          <p>管理全站共享曲谱，查看文件存储用量。</p>
        </div>
      </header>
      <SharedLibrary admin />
    </div>
  ),
});
