import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import type { DashboardStats } from "@/types"
import { TVA_RATE_LABELS } from "@/types"
import { formatCurrency } from "@/lib/utils"

interface TVABreakdownProps {
  tvaByRate: DashboardStats["tvaByRate"]
  totalTVA: number
}

const COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#6b7280"]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const { name, value, payload: p } = payload[0]
  return (
    <div className="rounded-lg border bg-white p-3 shadow-lg text-sm">
      <p className="font-semibold">{name}</p>
      <p className="text-muted-foreground">
        Base HT : <span className="font-medium text-foreground">{formatCurrency(p.baseHT)}</span>
      </p>
      <p className="text-muted-foreground">
        TVA : <span className="font-medium text-foreground">{formatCurrency(value)}</span>
      </p>
    </div>
  )
}

export function TVABreakdown({ tvaByRate, totalTVA }: TVABreakdownProps) {
  const data = Object.entries(tvaByRate).map(([rate, values]) => ({
    name: TVA_RATE_LABELS[Number(rate) as keyof typeof TVA_RATE_LABELS] ?? `TVA ${rate}%`,
    value: Math.round(values.montantTVA * 100) / 100,
    baseHT: Math.round(values.baseHT * 100) / 100,
    rate,
  }))

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Répartition TVA</CardTitle>
          <CardDescription>Par taux applicable</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
          Aucune TVA calculée
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Répartition TVA</CardTitle>
        <CardDescription>
          Total à reverser : <strong>{formatCurrency(totalTVA)}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="45%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((_entry, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: "11px" }}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="mt-4 space-y-2">
          {data.map((item, i) => (
            <div key={item.rate} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: COLORS[i % COLORS.length] }}
                />
                <span className="text-muted-foreground">{item.rate}%</span>
              </div>
              <div className="text-right">
                <span className="font-medium">{formatCurrency(item.value)}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  / {formatCurrency(item.baseHT)} HT
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
