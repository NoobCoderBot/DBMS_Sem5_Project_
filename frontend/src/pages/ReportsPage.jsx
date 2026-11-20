import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { productsApi, reportsApi, warehousesApi } from '../api/index.js';
import { useAsync, useList } from '../hooks/useList.js';
import { useTheme } from '../context/ThemeContext.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import { ErrorState, FilterSelect, LoadingBlock, PageHeader, SearchInput, StatCard, StatusBadge, Tabs } from '../components/ui/index.jsx';
import { downloadCsv, formatCurrency, formatCurrencyCompact, formatNumber } from '../utils/format.js';

const TABS = [
  { value: 'inventory', label: 'Inventory' },
  { value: 'warehouse', label: 'Warehouse stock' },
  { value: 'low-stock', label: 'Low stock' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'sales', label: 'Sales' },
  { value: 'movements', label: 'Stock movements' },
  { value: 'valuation', label: 'Valuation' },
];

/** Theme-aware Recharts colours/props. */
function useChartTheme() {
  const { chart } = useTheme();
  return {
    chart,
    axisProps: { tick: { fontSize: 11, fill: chart.tick }, tickLine: false, axisLine: { stroke: chart.grid } },
    tooltipStyle: { fontSize: 12, borderRadius: 6, border: `1px solid ${chart.tooltipBorder}`, background: chart.tooltipBg, color: chart.tooltipText, boxShadow: 'none' },
  };
}

function ExportButton({ name, columns, rows, disabled }) {
  return (
    <button className="btn-secondary" disabled={disabled || !rows?.length} onClick={() => downloadCsv(`stockflow-${name}-${new Date().toISOString().slice(0, 10)}.csv`, columns, rows)}>
      <Download className="h-4 w-4" /> Export CSV
    </button>
  );
}

function SimpleTable({ title, columns, rows, empty = 'No data for this period.' }) {
  return (
    <section className="card overflow-hidden">
      <h3 className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? <p className="px-4 py-8 text-center text-zinc-500">{empty}</p> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr>{columns.map((c) => <th key={c.label} className={`th ${c.right ? 'text-right' : ''}`}>{c.label}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={r._id || r.name || i}>{columns.map((c) => <td key={c.label} className={`td ${c.right ? 'text-right tabular-nums' : ''}`}>{c.render(r)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DateRange({ value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-zinc-500">From <input type="date" className="input w-auto" value={value.from || ''} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} /></label>
      <label className="flex items-center gap-1.5 text-xs text-zinc-500">To <input type="date" className="input w-auto" value={value.to || ''} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} /></label>
    </div>
  );
}

/* ---------------- Inventory (product-wise stock across warehouses) ---------------- */
function InventoryReport() {
  const list = useList((p) => reportsApi.get('inventory', p), { limit: 15 });
  const [warehouses, setWarehouses] = useState([]);
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    warehousesApi.list({ limit: 100 }).then((r) => setWarehouses(r.data.map((w) => ({ value: w._id, label: w.warehouseName })))).catch(() => {});
    productsApi.categories().then(setCategories).catch(() => {});
  }, []);

  const columns = [
    { key: 'productName', label: 'Product', render: (r) => (<div><p className="font-medium text-zinc-900">{r.productName}</p><p className="text-xs text-zinc-500">{r.SKU}</p></div>) },
    { key: 'category', label: 'Category' },
    { key: 'totalQuantity', label: 'On hand', align: 'right', render: (r) => formatNumber(r.totalQuantity) },
    { key: 'reservedQuantity', label: 'Reserved', align: 'right', render: (r) => formatNumber(r.reservedQuantity) },
    { key: 'availableQuantity', label: 'Available', align: 'right', render: (r) => <b>{formatNumber(r.availableQuantity)}</b> },
    { key: 'warehouses', label: 'Across warehouses', render: (r) => <span className="text-xs text-zinc-600">{r.warehouses.map((w) => `${w.warehouseName}: ${w.quantity}`).join(' · ')}</span> },
  ];
  const csv = [
    { label: 'Product', value: (r) => r.productName }, { label: 'SKU', value: (r) => r.SKU }, { label: 'Category', value: (r) => r.category },
    { label: 'On hand', value: (r) => r.totalQuantity }, { label: 'Reserved', value: (r) => r.reservedQuantity }, { label: 'Available', value: (r) => r.availableQuantity },
    { label: 'Warehouses', value: (r) => r.warehouses.map((w) => `${w.warehouseName}: ${w.quantity}`).join('; ') },
  ];
  const summary = list.extra?.summary;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput className="w-full sm:w-64" value={list.params.search} onChange={(v) => list.setParam('search', v)} placeholder="Search product or SKU" />
        <FilterSelect label="Warehouse" options={warehouses} value={list.params.warehouse} onChange={(v) => list.setParam('warehouse', v)} />
        <FilterSelect label="Category" options={categories} value={list.params.category} onChange={(v) => list.setParam('category', v)} />
        <div className="flex-1" />
        <ExportButton name="inventory" columns={csv} rows={list.rows} disabled={list.loading} />
      </div>
      {summary && <div className="grid grid-cols-2 gap-4"><StatCard label="Products with stock" value={formatNumber(summary.totalProducts)} /><StatCard label="Total units" value={formatNumber(summary.totalUnits)} /></div>}
      <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.refresh} pagination={list.pagination} onPage={list.setPage} />
    </div>
  );
}

/* ---------------- Warehouse stock ---------------- */
function WarehouseReport() {
  const { chart, axisProps, tooltipStyle } = useChartTheme();
  const { data, loading, error, reload } = useAsync(() => reportsApi.get('warehouse'));
  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const csv = [
    { label: 'Warehouse', value: (r) => r.warehouseName }, { label: 'Code', value: (r) => r.warehouseCode }, { label: 'Products', value: (r) => r.productCount },
    { label: 'Total units', value: (r) => r.totalUnits }, { label: 'Reserved', value: (r) => r.reservedUnits }, { label: 'Available', value: (r) => r.availableUnits }, { label: 'Cost value', value: (r) => r.costValue },
  ];
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><ExportButton name="warehouse-stock" columns={csv} rows={data.data} /></div>
      <section className="card p-4">
        <h3 className="mb-2 text-sm font-semibold">Units per warehouse</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.data} margin={{ left: -10 }}>
              <CartesianGrid stroke={chart.grid} vertical={false} />
              <XAxis dataKey="warehouseName" {...axisProps} />
              <YAxis {...axisProps} width={56} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatNumber(v)} />
              <Bar dataKey="totalUnits" name="On hand" fill={chart.accent} radius={[3, 3, 0, 0]} maxBarSize={56} />
              <Bar dataKey="reservedUnits" name="Reserved" fill={chart.muted} radius={[3, 3, 0, 0]} maxBarSize={56} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <SimpleTable title="Stock per warehouse" rows={data.data} columns={[
        { label: 'Warehouse', render: (r) => <span className="font-medium text-zinc-900">{r.warehouseName} <span className="text-xs font-normal text-zinc-400">{r.warehouseCode}</span></span> },
        { label: 'Location', render: (r) => r.location || '-' },
        { label: 'Products', right: true, render: (r) => r.productCount },
        { label: 'On hand', right: true, render: (r) => formatNumber(r.totalUnits) },
        { label: 'Reserved', right: true, render: (r) => formatNumber(r.reservedUnits) },
        { label: 'Available', right: true, render: (r) => formatNumber(r.availableUnits) },
        { label: 'Value at cost', right: true, render: (r) => formatCurrency(r.costValue) },
      ]} />
    </div>
  );
}

/* ---------------- Low stock ---------------- */
function LowStockReport() {
  const list = useList((p) => reportsApi.get('low-stock', p), { limit: 15 });
  const columns = [
    { key: 'productName', label: 'Product', render: (r) => (<div><p className="font-medium text-zinc-900">{r.productName}</p><p className="text-xs text-zinc-500">{r.SKU}</p></div>) },
    { key: 'category', label: 'Category' },
    { key: 'totalQuantity', label: 'Total stock', align: 'right', render: (r) => <b className={r.totalQuantity === 0 ? 'text-red-600' : 'text-amber-700'}>{r.totalQuantity}</b> },
    { key: 'reorderLevel', label: 'Reorder level', align: 'right' },
    { key: 'shortfall', label: 'Shortfall', align: 'right' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.totalQuantity === 0 ? 'out-of-stock' : 'low-stock'} /> },
  ];
  const csv = [{ label: 'Product', value: (r) => r.productName }, { label: 'SKU', value: (r) => r.SKU }, { label: 'Category', value: (r) => r.category }, { label: 'Total stock', value: (r) => r.totalQuantity }, { label: 'Reorder level', value: (r) => r.reorderLevel }, { label: 'Shortfall', value: (r) => r.shortfall }];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput className="w-full sm:w-64" value={list.params.search} onChange={(v) => list.setParam('search', v)} placeholder="Search product or SKU" />
        <div className="flex-1" />
        <ExportButton name="low-stock" columns={csv} rows={list.rows} disabled={list.loading} />
      </div>
      <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.refresh} pagination={list.pagination} onPage={list.setPage} />
    </div>
  );
}

/* ---------------- Purchases / Sales ---------------- */
function OrdersReport({ kind }) {
  const { chart, axisProps, tooltipStyle } = useChartTheme();
  const isPurchase = kind === 'purchases';
  const [range, setRange] = useState({});
  const { data, loading, error, reload } = useAsync(() => reportsApi.get(kind, range), [kind, range.from, range.to]);

  const partyRows = data ? (isPurchase ? data.data.bySupplier : data.data.byCustomer) : [];
  const csv = [{ label: isPurchase ? 'Supplier' : 'Customer', value: (r) => r.name }, { label: 'Orders', value: (r) => r.orders }, { label: 'Total amount', value: (r) => r.totalAmount }];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <DateRange value={range} onChange={setRange} />
        <div className="flex-1" />
        <ExportButton name={isPurchase ? 'supplier-purchases' : 'customer-sales'} columns={csv} rows={partyRows} disabled={loading} />
      </div>
      {loading && <LoadingBlock />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && (() => {
        const d = data.data;
        return (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Orders" value={formatNumber(d.summary.orders)} />
              <StatCard label={isPurchase ? 'Total purchased' : 'Total sold'} value={formatCurrencyCompact(d.summary.totalAmount)} hint={formatCurrency(d.summary.totalAmount)} />
              <StatCard label="Average order value" value={formatCurrency(d.summary.averageOrderValue)} />
              <StatCard label="Tax collected / paid" value={formatCurrency(d.summary.tax)} />
            </div>
            <section className="card p-4">
              <h3 className="mb-2 text-sm font-semibold">{isPurchase ? 'Monthly purchases' : 'Monthly sales'} (last 12 months)</h3>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.monthly} margin={{ left: -10 }}>
                    <CartesianGrid stroke={chart.grid} vertical={false} />
                    <XAxis dataKey="month" {...axisProps} />
                    <YAxis {...axisProps} width={64} tickFormatter={(v) => formatCurrencyCompact(v).replace('.0', '')} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(v)} />
                    <Bar dataKey="total" name="Total" fill={isPurchase ? chart.muted : chart.accent} radius={[3, 3, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <SimpleTable title={isPurchase ? 'Supplier-wise purchases' : 'Customer-wise sales'} rows={partyRows} columns={[{ label: isPurchase ? 'Supplier' : 'Customer', render: (r) => r.name }, { label: 'Orders', right: true, render: (r) => r.orders }, { label: 'Amount', right: true, render: (r) => formatCurrency(r.totalAmount) }]} />
              <SimpleTable title="Top products" rows={d.topProducts} columns={[{ label: 'Product', render: (r) => <>{r.name} <span className="text-xs text-zinc-400">{r.SKU}</span></> }, { label: 'Units', right: true, render: (r) => formatNumber(r.units) }, { label: 'Amount', right: true, render: (r) => formatCurrency(r.amount) }]} />
            </div>
            <SimpleTable title="Orders by status" rows={d.byStatus} columns={[{ label: 'Status', render: (r) => <StatusBadge status={r._id} /> }, { label: 'Orders', right: true, render: (r) => r.orders }, { label: 'Amount', right: true, render: (r) => formatCurrency(r.totalAmount) }]} />
          </>
        );
      })()}
    </div>
  );
}

/* ---------------- Stock movement summary ---------------- */
function MovementsReport() {
  const [range, setRange] = useState({});
  const { data, loading, error, reload } = useAsync(() => reportsApi.get('stock-movements', range), [range.from, range.to]);
  const csv = [{ label: 'Movement type', value: (r) => r._id }, { label: 'Entries', value: (r) => r.count }, { label: 'Units in', value: (r) => r.unitsIn }, { label: 'Units out', value: (r) => r.unitsOut }];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <DateRange value={range} onChange={setRange} />
        <div className="flex-1" />
        <ExportButton name="movement-summary" columns={csv} rows={data?.data.byType} disabled={loading} />
      </div>
      {loading && <LoadingBlock />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Ledger entries" value={formatNumber(data.data.totals.count)} />
            <StatCard label="Units in" value={formatNumber(data.data.totals.unitsIn)} />
            <StatCard label="Units out" value={formatNumber(data.data.totals.unitsOut)} />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SimpleTable title="By movement type" rows={data.data.byType} columns={[{ label: 'Type', render: (r) => <StatusBadge status={r._id} /> }, { label: 'Entries', right: true, render: (r) => r.count }, { label: 'Units in', right: true, render: (r) => formatNumber(r.unitsIn) }, { label: 'Units out', right: true, render: (r) => formatNumber(r.unitsOut) }]} />
            <SimpleTable title="By warehouse" rows={data.data.byWarehouse} columns={[{ label: 'Warehouse', render: (r) => r.name }, { label: 'Entries', right: true, render: (r) => r.count }, { label: 'Units in', right: true, render: (r) => formatNumber(r.unitsIn) }, { label: 'Units out', right: true, render: (r) => formatNumber(r.unitsOut) }]} />
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Valuation ---------------- */
function ValuationReport() {
  const { data, loading, error, reload } = useAsync(() => reportsApi.get('valuation'));
  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const d = data.data;
  const cols = (label) => [
    { label, render: (r) => r.name },
    { label: 'Units', right: true, render: (r) => formatNumber(r.units) },
    { label: 'Cost value', right: true, render: (r) => formatCurrency(r.costValue) },
    { label: 'Retail value', right: true, render: (r) => formatCurrency(r.retailValue) },
  ];
  const csv = [{ label: 'Product', value: (r) => r.name }, { label: 'SKU', value: (r) => r.SKU }, { label: 'Units', value: (r) => r.units }, { label: 'Unit cost', value: (r) => r.unitCost }, { label: 'Cost value', value: (r) => r.costValue }, { label: 'Retail value', value: (r) => r.retailValue }];
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><ExportButton name="valuation" columns={csv} rows={d.byProduct} /></div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Units on hand" value={formatNumber(d.summary.totalUnits)} />
        <StatCard label="Value at cost" value={formatCurrencyCompact(d.summary.costValue)} hint={formatCurrency(d.summary.costValue)} />
        <StatCard label="Value at retail" value={formatCurrencyCompact(d.summary.retailValue)} hint={formatCurrency(d.summary.retailValue)} />
        <StatCard label="Potential margin" value={formatCurrencyCompact(d.summary.potentialMargin)} hint={formatCurrency(d.summary.potentialMargin)} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SimpleTable title="By warehouse" rows={d.byWarehouse} columns={cols('Warehouse')} />
        <SimpleTable title="By category" rows={d.byCategory} columns={cols('Category')} />
      </div>
      <SimpleTable title="By product (top 100 by cost value)" rows={d.byProduct} columns={[
        { label: 'Product', render: (r) => <>{r.name} <span className="text-xs text-zinc-400">{r.SKU}</span></> },
        { label: 'Units', right: true, render: (r) => formatNumber(r.units) },
        { label: 'Unit cost', right: true, render: (r) => formatCurrency(r.unitCost) },
        { label: 'Cost value', right: true, render: (r) => formatCurrency(r.costValue) },
        { label: 'Retail value', right: true, render: (r) => formatCurrency(r.retailValue) },
      ]} />
    </div>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = useState('inventory');
  return (
    <>
      <PageHeader title="Reports" description="Aggregated directly in MongoDB from live inventory, order and ledger data." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'inventory' && <InventoryReport />}
        {tab === 'warehouse' && <WarehouseReport />}
        {tab === 'low-stock' && <LowStockReport />}
        {tab === 'purchases' && <OrdersReport key="purchases" kind="purchases" />}
        {tab === 'sales' && <OrdersReport key="sales" kind="sales" />}
        {tab === 'movements' && <MovementsReport />}
        {tab === 'valuation' && <ValuationReport />}
      </div>
    </>
  );
}
