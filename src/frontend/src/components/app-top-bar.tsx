"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

interface AppTopBarProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  maxWidthClassName?: string;
  children?: ReactNode;
}

export function AppTopBar({
  title,
  subtitle,
  backHref,
  backLabel = "Home",
  maxWidthClassName = "max-w-7xl",
  children,
}: AppTopBarProps) {
  return (
    <header className="border-b bg-card">
      <div className={`${maxWidthClassName} mx-auto px-4 py-2.5 flex items-center justify-between gap-4`}>
        <div className="flex min-w-0 items-center gap-3">
          {backHref && (
            <>
              <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground">
                <Link href={backHref}>
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {backLabel}
                </Link>
              </Button>
              <div className="h-4 w-px bg-border" />
            </>
          )}
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>
              {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          {children}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
