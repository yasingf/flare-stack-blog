import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon,
  trend,
  className,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  trend?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "stat-card relative border border-border/30 bg-background p-6 flex flex-col justify-between h-32 overflow-hidden",
        "transition-all duration-[400ms] ease-[cubic-bezier(0.34,1.3,0.64,1)]",
        "hover:border-accent/25 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_hsl(var(--accent)/0.08)]",
        "group/stat",
        className,
      )}
    >
      {/* Decorative hover glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover/stat:opacity-100 transition-opacity duration-500"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 100%, hsl(var(--accent) / 0.04) 0%, transparent 70%)",
        }}
      />
      <div className="flex justify-between items-start relative">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2 group-hover/stat:text-muted-foreground transition-colors duration-300">
          {icon}
          {label}
        </div>
        {trend && (
          <div className="text-[10px] font-mono text-muted-foreground">
            {trend}
          </div>
        )}
      </div>
      <div className="text-4xl font-serif font-medium tracking-tight text-foreground mt-auto relative transition-transform duration-[400ms] ease-[cubic-bezier(0.34,1.3,0.64,1)] group-hover/stat:translate-x-0.5">
        {value}
      </div>
    </div>
  );
}
