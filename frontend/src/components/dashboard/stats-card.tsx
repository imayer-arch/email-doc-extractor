"use client";

import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color: "cyan" | "green" | "orange" | "purple";
  delay?: number;
}

const colorClasses = {
  cyan: {
    bg: "from-cyan-500/20 to-cyan-500/5",
    icon: "text-cyan-400 bg-cyan-500/20",
    border: "border-cyan-500/30",
  },
  green: {
    bg: "from-green-500/20 to-green-500/5",
    icon: "text-green-400 bg-green-500/20",
    border: "border-green-500/30",
  },
  orange: {
    bg: "from-orange-500/20 to-orange-500/5",
    icon: "text-orange-400 bg-orange-500/20",
    border: "border-orange-500/30",
  },
  purple: {
    bg: "from-purple-500/20 to-purple-500/5",
    icon: "text-purple-400 bg-purple-500/20",
    border: "border-purple-500/30",
  },
};

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color,
  delay = 0,
}: StatsCardProps) {
  const colors = colorClasses[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Card
        className={cn(
          "bg-gradient-to-br border backdrop-blur-xl overflow-hidden relative",
          colors.bg,
          colors.border
        )}
      >
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-400">{title}</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold text-white">{value}</p>
                {trend && (
                  <span
                    className={cn(
                      "text-sm font-medium",
                      trend.isPositive ? "text-green-400" : "text-red-400"
                    )}
                  >
                    {trend.isPositive ? "+" : ""}{trend.value}%
                  </span>
                )}
              </div>
              {subtitle && (
                <p className="text-xs text-slate-500">{subtitle}</p>
              )}
            </div>
            <div className={cn("p-3 rounded-xl", colors.icon)}>
              <Icon className="h-6 w-6" />
            </div>
          </div>
        </CardContent>
        {/* Decorative glow */}
        <div
          className={cn(
            "absolute -bottom-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-20",
            color === "cyan" && "bg-cyan-500",
            color === "green" && "bg-green-500",
            color === "orange" && "bg-orange-500",
            color === "purple" && "bg-purple-500"
          )}
        />
      </Card>
    </motion.div>
  );
}
