import { TrendingUp, TrendingDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface StatsCardProps {
  title: string
  value: string
  description?: string
  icon: React.ReactNode
  trend?: { value: number; label: string }
  variant?: "default" | "primary" | "success" | "warning" | "danger"
}

const VARIANT_STYLES = {
  default: "bg-white",
  primary: "bg-primary text-white",
  success: "bg-emerald-50",
  warning: "bg-amber-50",
  danger: "bg-red-50",
}

const ICON_VARIANT_STYLES = {
  default: "bg-primary/10 text-primary",
  primary: "bg-white/20 text-white",
  success: "bg-emerald-100 text-emerald-600",
  warning: "bg-amber-100 text-amber-600",
  danger: "bg-red-100 text-red-600",
}

export function StatsCard({
  title,
  value,
  description,
  icon,
  trend,
  variant = "default",
}: StatsCardProps) {
  return (
    <Card className={cn("border", VARIANT_STYLES[variant])}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "text-sm font-medium truncate",
                variant === "primary" ? "text-white/80" : "text-muted-foreground"
              )}
            >
              {title}
            </p>
            <p
              className={cn(
                "mt-1 text-2xl font-bold tracking-tight",
                variant === "primary" ? "text-white" : "text-foreground"
              )}
            >
              {value}
            </p>
            {description && (
              <p
                className={cn(
                  "mt-1 text-xs",
                  variant === "primary" ? "text-white/70" : "text-muted-foreground"
                )}
              >
                {description}
              </p>
            )}
            {trend && (
              <div
                className={cn(
                  "mt-2 flex items-center gap-1 text-xs font-medium",
                  trend.value >= 0 ? "text-emerald-600" : "text-red-600",
                  variant === "primary" && "text-white/90"
                )}
              >
                {trend.value >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
                {Math.abs(trend.value)}% {trend.label}
              </div>
            )}
          </div>
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ml-4",
              ICON_VARIANT_STYLES[variant]
            )}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
