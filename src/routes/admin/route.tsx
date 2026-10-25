import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  ClientOnly,
  Link,
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useMatches,
} from "@tanstack/react-router";
import { isAdminWorkspace } from "@/components/admin/content-workspace";
import "@/components/admin/content-workspace.css";
import { ArrowUpRight, Settings, Menu } from "lucide-react";
import { useRef, useState } from "react";
import {
  AdminChromeProvider,
  useAdminChrome,
} from "@/components/admin/admin-chrome";
import { SideBar } from "@/components/admin/side-bar";
import { PageFade } from "@/components/layout/page-fade";
import { Toaster } from "@/components/layout/toaster";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { sessionQuery } from "@/features/auth/queries";
import { settingsSectionFromPath } from "@/features/config/components/admin/settings-pages";
import { useVersionCheck } from "@/features/version/hooks/use-version-check";
import { CACHE_CONTROL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);

    if (!session) {
      throw redirect({ to: "/login" });
    }
    if (session.user.role !== "admin") {
      throw redirect({ to: "/" });
    }

    return { session };
  },
  component: AdminLayout,
  loader: () => ({
    title: m.admin_layout_title(),
  }),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.title,
      },
    ],
  }),
  headers: () => {
    return CACHE_CONTROL.private;
  },
});

function pageTitleFromMatches(matches: ReturnType<typeof useMatches>): string {
  for (let i = matches.length - 1; i >= 0; i--) {
    const title = (matches[i]?.loaderData as { title?: string } | undefined)
      ?.title;
    if (typeof title === "string" && title.length > 0) return title;
  }
  return "";
}

function AdminLayout() {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const closeMobileSidebar = () => setIsMobileSidebarOpen(false);
  const pathname = useLocation({ select: (location) => location.pathname });
  const editorWorkspace = isPostEditorPath(pathname);
  useVersionCheck();

  return (
    <AdminChromeProvider>
      <div
        className={cn(
          "admin-layout h-dvh overflow-hidden bg-background text-foreground flex relative font-sans",
          editorWorkspace && "admin-editor-layout",
        )}
      >
        <SideBar
          isMobileSidebarOpen={isMobileSidebarOpen}
          closeMobileSidebar={closeMobileSidebar}
        />

        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <MobileTopBar onOpenSidebar={() => setIsMobileSidebarOpen(true)} />
          <AdminMain />
        </main>
        <Toaster />
      </div>
    </AdminChromeProvider>
  );
}

function isPostEditorPath(pathname: string) {
  return /\/admin\/posts\/edit\/[^/]+/.test(pathname);
}

function AdminMain() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pathname = useLocation({ select: (location) => location.pathname });
  const contentWorkspace = isAdminWorkspace(pathname);
  const fill = isPostEditorPath(pathname) || contentWorkspace;

  return (
    <div
      ref={scrollerRef}
      data-scroll-restoration-id={
        contentWorkspace ? "admin-content-outer" : undefined
      }
      className={cn(
        "flex-1 min-h-0",
        !isPostEditorPath(pathname) && "p-6 md:p-12",
        contentWorkspace && "admin-list-region",
        fill
          ? "flex flex-col overflow-hidden"
          : "overflow-y-auto custom-scrollbar",
      )}
    >
      <div className={cn("w-full", fill && "flex min-h-0 flex-1 flex-col")}>
        <PageFade
          fill={fill}
          includeSearch={false}
          pathKey={(path) => {
            if (settingsSectionFromPath(path)) return "/admin/settings/*";
            const edit = path.match(/\/admin\/posts\/edit\/([^/]+)/);
            if (edit) return `/admin/posts/edit/${edit[1]}`;
            return path;
          }}
          onEntered={() => {
            if (!contentWorkspace) scrollerRef.current?.scrollTo(0, 0);
          }}
        >
          <Outlet />
        </PageFade>
      </div>
    </div>
  );
}

function MobileTopBar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const matches = useMatches();
  const pageTitle = pageTitleFromMatches(matches);
  const { primaryAction, mobileTitle } = useAdminChrome();

  return (
    <header className="h-20 border-b border-border/30 bg-background shrink-0 sticky top-0 z-30 px-6 md:px-10">
      <div className="flex items-center gap-4 h-full">
        <IconButton
          size="md"
          className="md:hidden"
          onClick={onOpenSidebar}
          label={m.admin_layout_open_navigation()}
        >
          <Menu size={20} strokeWidth={1.5} />
        </IconButton>
        <div className="hidden md:block flex-1">
          <ClientOnly fallback={m.admin_layout_title()}>
            <Breadcrumbs />
          </ClientOnly>
        </div>
        <h1 className="md:hidden flex-1 min-w-0 truncate text-base font-medium fuwari-text-90">
          <ClientOnly fallback={m.admin_layout_title()}>
            {mobileTitle ?? pageTitle}
          </ClientOnly>
        </h1>
        {primaryAction ? (
          <Button
            className="md:hidden"
            variant="primary"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
          >
            {primaryAction.label}
          </Button>
        ) : (
          <span className="md:hidden w-9" />
        )}
        <div className="hidden md:flex items-center gap-6 text-muted-foreground">
          <Link to="/admin/settings" title="系统设置" className="p-2">
            <Settings size={18} strokeWidth={1.5} />
          </Link>
          <div className="h-4 w-px bg-border/40" />
          <Link
            to="/"
            className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest"
          >
            <span>返回前台</span>
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
    </header>
  );
}
