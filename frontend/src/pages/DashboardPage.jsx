import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { reportsApi } from '../api/index.js';
import { useAsync } from '../hooks/useList.js';
import { useTheme } from '../context/ThemeContext.jsx';
import { Rise } from '../components/ui/Motion.jsx';
import { ErrorState, KpiStrip, LoadingBlock, PageHeader, StatusBadge } from '../components/ui/index.jsx';
import { formatCurrency, formatCurrencyCompact, formatDate, formatDateTime, formatNumber, ORDER_TYPE_META } from '../utils/format.js';


function Panel({ title, note, action, children, className = '', delay = 0 }) {
  return (
    <section style={{ animationDelay: `${delay}ms` }} className={`card animate-rise ${className}`}>
      <div className="flex items-baseline justify-between gap-3 px-4 pb-1 pt-3.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[13px] font-semibold text-zinc-900">{title}</h2>
          {note && <span className="text-xs text-zinc-500">{note}</span>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const LinkAction = ({ to, children }) => <Link to={to} className="text-xs font-medium text-brand-700 hover:underline">{children}</Link>;

/** Ranked horizontal bars drawn with plain markup: sharper and more legible than a donut/column chart. */
function RankedBars({ rows, unit = 'units' }) {
  const max = Math.max(...rows.map((r) => r.units), 1);
  const total = rows.reduce((s, r) => s + r.units, 0) || 1;
  return (
    <ul className="space-y-3 px-4 pb-4 pt-3">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate text-zinc-800">{r.name}</span>
            <span className="shrink-0 tabular-nums text-zinc-500">
              <b className="font-semibold text-zinc-900">{formatNumber(r.units)}</b> {unit} &middot; {Math.round((r.units / total) * 100)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-100"><div className="animate-grow-x h-full rounded-full bg-zinc-800" style={{ width: `${(r.units / max) * 100}%`, animationDelay: "250ms" }} /></div>
        </li>
      ))}
      {rows.length === 0 && <li className="py-6 text-center text-zinc-500">No stock recorded yet.</li>}
    </ul>
  );
}

function orderParty(o) {
  if (o.orderType === 'purchase') return o.supplier?.supplierName;
  if (o.orderType === 'sale') return o.customer?.customerName;
  return `${o.sourceWarehouse?.warehouseName} → ${o.destinationWarehouse?.warehouseName}`;
}

export default function DashboardPage() {
  const { data, loading, error, reload } = useAsync(() => reportsApi.dashboard());
  const { chart } = useTheme();
  const axisProps = { tick: { fontSize: 11, fill: chart.tick }, tickLine: false, axisLine: { stroke: chart.grid } };
  const tooltipStyle = { fontSize: 12, borderRadius: 6, border: `1px solid ${chart.tooltipBorder}`, background: chart.tooltipBg, color: chart.tooltipText, boxShadow: 'none' };

  if (loading && !data) return <LoadingBlock label="Loading overview..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const { stats, charts, tables } = data;
  const monthly = charts.monthlyPurchases.map((p, i) => ({ month: p.month, Purchases: p.total, Sales: charts.monthlySales[i].total }));

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Stock position across ${stats.totalWarehouses} warehouses, as of ${formatDateTime(new Date())}`}
        actions={<button className="btn-secondary" onClick={reload} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>}
      />

      <div className="space-y-3">
        <KpiStrip
          items={[
            { label: 'Inventory value', number: stats.inventoryValue, format: (n) => formatCurrencyCompact(n), value: formatCurrencyCompact(stats.inventoryValue), hint: `${formatCurrency(stats.inventoryValue)} at cost` },
            { label: 'Units on hand', number: stats.totalInventoryUnits, format: (n) => formatNumber(Math.round(n)), value: formatNumber(stats.totalInventoryUnits), hint: `across ${stats.totalWarehouses} warehouses` },
            { label: 'Active products', number: stats.totalProducts, value: formatNumber(stats.totalProducts), hint: 'in the catalogue' },
            { label: 'Warehouses', value: formatNumber(stats.totalWarehouses), hint: 'active locations' },
          ]}
        />
        <KpiStrip
          columns={3}
          items={[
            { label: 'Low stock products', number: stats.lowStockProducts, value: formatNumber(stats.lowStockProducts), hint: 'at or below reorder level', to: '/inventory?lowStock=true', tone: stats.lowStockProducts ? 'warn' : undefined },
            { label: 'Open purchase orders', number: stats.pendingPurchaseOrders, value: formatNumber(stats.pendingPurchaseOrders), hint: 'draft, ordered or part-received', to: '/purchase-orders' },
            { label: 'Open sales orders', number: stats.pendingSalesOrders, value: formatNumber(stats.pendingSalesOrders), hint: 'draft, confirmed or processing', to: '/sales-orders' },
          ]}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel delay={120} title="Purchases and sales" note="by order month, last 12 months" className="xl:col-span-2">
          <div className="h-72 px-2 pb-3 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ left: 0, right: 12, top: 8 }} barGap={2}>
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis dataKey="month" {...axisProps} />
                <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => formatCurrencyCompact(v).replace('.0', '')} width={58} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: chart.cursor }} formatter={(v) => formatCurrency(v)} />
                <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 4, color: chart.tick }} />
                <Bar dataKey="Purchases" fill={chart.muted} radius={[2, 2, 0, 0]} maxBarSize={14} />
                <Bar dataKey="Sales" fill={chart.accent} radius={[2, 2, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel delay={180} title="Stock by warehouse" note="units on hand">
          <RankedBars rows={charts.warehouseStock} />
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel delay={240} title="Needs reordering" action={<LinkAction to="/reports">All low stock</LinkAction>} className="xl:col-span-2">
          {tables.lowStock.length === 0 ? (
            <p className="px-4 py-10 text-center text-zinc-500">No product is below its reorder level.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead><tr><th className="th">Product</th><th className="th">Category</th><th className="th text-right">In stock</th><th className="th text-right">Reorder at</th><th className="th text-right">Short by</th></tr></thead>
                <tbody>
                  {tables.lowStock.map((p) => (
                    <tr key={p._id}>
                      <td className="td"><span className="font-medium text-zinc-900">{p.productName}</span> <span className="ml-1 font-mono text-xs text-zinc-400">{p.SKU}</span></td>
                      <td className="td text-zinc-500">{p.category}</td>
                      <td className={`td text-right tabular-nums font-medium ${p.totalQuantity === 0 ? 'text-red-600' : 'text-amber-700'}`}>{p.totalQuantity}</td>
                      <td className="td text-right tabular-nums">{p.reorderLevel}</td>
                      <td className="td text-right tabular-nums">{p.shortfall}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel delay={300} title="Stock by category" note="units on hand">
          <RankedBars rows={charts.categoryStock} />
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel delay={360} title="Recent orders" action={<LinkAction to="/sales-orders">Sales orders</LinkAction>}>
          <table className="min-w-full">
            <thead><tr><th className="th">Order</th><th className="th">Party / route</th><th className="th">Status</th><th className="th text-right">Total</th></tr></thead>
            <tbody>
              {tables.recentOrders.map((o) => (
                <tr key={o._id} className="hover:bg-zinc-50">
                  <td className="td">
                    <Link className="font-mono text-xs font-medium text-brand-700 hover:underline" to={`${ORDER_TYPE_META[o.orderType].base}/${o._id}`}>{o.orderNumber}</Link>
                    <p className="text-xs text-zinc-400">{formatDate(o.orderDate)}</p>
                  </td>
                  <td className="td max-w-[13rem] truncate">{orderParty(o)}</td>
                  <td className="td"><StatusBadge status={o.status} /></td>
                  <td className="td text-right tabular-nums">{o.orderType === 'transfer' ? '-' : formatCurrency(o.grandTotal)}</td>
                </tr>
              ))}
              {tables.recentOrders.length === 0 && <tr><td className="td py-8 text-center text-zinc-500" colSpan={4}>No orders yet.</td></tr>}
            </tbody>
          </table>
        </Panel>

        <Panel delay={420} title="Latest stock movements" action={<LinkAction to="/stock-movements">Full ledger</LinkAction>}>
          <table className="min-w-full">
            <thead><tr><th className="th">Product</th><th className="th">Type</th><th className="th text-right">Qty</th><th className="th">When</th></tr></thead>
            <tbody>
              {tables.recentMovements.map((m) => (
                <tr key={m._id}>
                  <td className="td"><p className="font-medium text-zinc-900">{m.product?.productName}</p><p className="text-xs text-zinc-400">{m.warehouse?.warehouseName}</p></td>
                  <td className="td"><StatusBadge status={m.movementType} /></td>
                  <td className={`td text-right tabular-nums font-medium ${m.quantity > 0 ? 'text-emerald-700' : 'text-zinc-900'}`}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                  <td className="td whitespace-nowrap text-xs text-zinc-500">{formatDateTime(m.createdAt)}</td>
                </tr>
              ))}
              {tables.recentMovements.length === 0 && <tr><td className="td py-8 text-center text-zinc-500" colSpan={4}>No stock movements yet.</td></tr>}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
