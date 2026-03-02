import { ClientOnly } from "@tanstack/react-router";
import { Music } from "lucide-react";
import { Suspense, lazy } from "react";
import type { GuitarProViewerProps } from "./types";

const GuitarProViewerLazy = lazy(() => import("./guitar-pro-viewer"));

const LoadingFallback = () => (
  <div className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-md flex items-center justify-center">
    <div className="flex flex-col items-center gap-6">
      {/* Musical icon with breathing pulse ring */}
      <div className="relative flex items-center justify-center">
        <Music
          size={28}
          className="text-accent"
          style={{ animation: "breathe 2s ease-in-out infinite" }}
        />
        <div
          className="absolute inset-[-12px] rounded-full border border-accent/30"
          style={{ animation: "pulse-ring 2s ease-out infinite" }}
        />
      </div>

      {/* Loading bars */}
      <div
        className="flex items-end gap-[3px] h-4"
        style={{ animation: "loading-bars 1.2s ease-in-out infinite" }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="w-[3px] bg-accent/60 rounded-full"
            style={{
              height: `${40 + Math.sin(i * 1.2) * 40}%`,
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </div>

      <span className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
        加载 Guitar Pro 引擎...
      </span>
    </div>
  </div>
);

/**
 * Guitar Pro 查看器入口 — 懒加载 alphaTab（约 1.3MB SoundFont + 渲染引擎）
 * 使用 ClientOnly 确保不在 SSR 中运行
 */
export function GuitarProViewer(props: GuitarProViewerProps) {
  if (!props.isOpen) return null;

  return (
    <ClientOnly fallback={<LoadingFallback />}>
      <Suspense fallback={<LoadingFallback />}>
        <GuitarProViewerLazy {...props} />
      </Suspense>
    </ClientOnly>
  );
}
