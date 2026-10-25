import type { NavOption } from "@/components/layout/layout-props";
import { useClassicConfig } from "./classic-config";

interface FooterProps {
  navOptions: Array<NavOption>;
}

export function Footer({ navOptions }: FooterProps) {
  const blogConfig = useClassicConfig();
  return (
    <footer className="border-t border-border/30 bg-card/50 backdrop-blur-sm py-16 mt-32">
      <div className="max-w-3xl mx-auto px-6 md:px-0 flex flex-col md:flex-row justify-between items-center gap-8">
        {/* Brand / Copyright */}
        <div className="flex flex-col items-center md:items-start gap-2">
          <span className="font-serif text-lg font-bold tracking-tighter text-foreground">
            [ {blogConfig.name} ]
          </span>
          <span className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase">
            © {new Date().getFullYear()} {blogConfig.author}.
          </span>
        </div>

        {/* Minimalist Links */}
        <nav className="flex items-center gap-8 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">
          {navOptions.map((option) => (
            <a
              key={option.id}
              href={option.href}
              target={option.external ? "_blank" : undefined}
              rel={option.external ? "noreferrer" : undefined}
              className="hover:text-accent transition-all duration-[350ms] ease-[cubic-bezier(0.25,0.1,0.25,1)]"
            >
              {option.label}
            </a>
          ))}
          <a
            href={blogConfig.social.github}
            target="_blank"
            rel="noreferrer"
            className="hover:text-accent transition-all duration-[350ms] ease-[cubic-bezier(0.25,0.1,0.25,1)]"
          >
            Github
          </a>
          <a
            href={`mailto:${blogConfig.social.email}`}
            className="hover:text-accent transition-all duration-[350ms] ease-[cubic-bezier(0.25,0.1,0.25,1)]"
          >
            Email
          </a>
        </nav>
      </div>
    </footer>
  );
}
