import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { movementsApi, warehousesApi } from '../api/index.js';
import { useList } from '../hooks/useList.js';
import DataTable from '../components/ui/DataTable.jsx';
import { FilterSelect, PageHeader, SearchInput, StatusBadge } from '../components/ui/index.jsx';
import { formatDateTime, MOVEMENT_TYPES, ORDER_TYPE_META } from '../utils/format.js';

export default function StockMovementsPage() {
  const [qs] = useSearchParams();
  const list = useList((p) => movementsApi.list(p), { product: qs.get('product') || '', warehouse: qs.get('warehouse') || '' });
  const [warehouses, setWarehouses] = useState([]);

  useEffect(() => {
    warehousesApi.list({ limit: 100 }).then((r) => setWarehouses(r.data.map((w) => ({ value: w._id, label: w.warehouseName })))).catch(() => {});
  }, []);

  const columns = [
    { key: 'createdAt', label: 'Date', sortKey: 'createdAt', render: (r) => <span className="whitespace-nowrap">{formatDateTime(r.createdAt)}</span> },
    { key: 'product', label: 'Product', render: (r) => (<div><p className="font-medium text-zinc-900">{r.product?.productName}</p><p className="text-xs text-zinc-500">{r.product?.SKU}</p></div>) },
    { key: 'warehouse', label: 'Warehouse', render: (r) => r.warehouse?.warehouseName },
    { key: 'movementType', label: 'Type', render: (r) => <StatusBadge status={r.movementType} /> },
    { key: 'quantity', label: 'Qty', align: 'right', sortKey: 'quantity', render: (r) => <b className={r.quantity > 0 ? 'text-emerald-700' : 'text-red-600'}>{r.quantity > 0 ? `+${r.quantity}` : r.quantity}</b> },
    { key: 'previousQuantity', label: 'Previous', align: 'right' },
    { key: 'newQuantity', label: 'New', align: 'right' },
    {
      key: 'referenceOrder',
      label: 'Reference',
      render: (r) =>
        r.referenceOrder ? (
          <Link className="text-brand-700 hover:underline" to={`${ORDER_TYPE_META[r.referenceOrder.orderType].base}/${r.referenceOrder._id}`}>{r.referenceOrder.orderNumber}</Link>
        ) : (
          <span className="text-zinc-400">Manual</span>
        ),
    },
    { key: 'performedBy', label: 'By', render: (r) => r.performedBy?.name },
    { key: 'remarks', label: 'Remarks', render: (r) => <span className="block max-w-[16rem] truncate text-zinc-500" title={r.remarks}>{r.remarks || '-'}</span> },
  ];

  const hasFilters = ['search', 'warehouse', 'movementType', 'from', 'to', 'product'].some((k) => list.params[k]);

  return (
    <>
      <PageHeader title="Stock Movements" description="Immutable ledger of every stock change. Entries are created automatically and cannot be edited." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput className="w-full sm:w-64" value={list.params.search} onChange={(v) => list.setParam('search', v)} placeholder="Search product, warehouse or remarks" />
        <FilterSelect label="Type" options={MOVEMENT_TYPES} value={list.params.movementType} onChange={(v) => list.setParam('movementType', v)} />
        <FilterSelect label="Warehouse" options={warehouses} value={list.params.warehouse} onChange={(v) => list.setParam('warehouse', v)} />
        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          From <input type="date" className="input w-auto" value={list.params.from || ''} max={list.params.to || undefined} onChange={(e) => list.setParam('from', e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          To <input type="date" className="input w-auto" value={list.params.to || ''} min={list.params.from || undefined} onChange={(e) => list.setParam('to', e.target.value)} />
        </label>
        {hasFilters && <button className="btn-ghost" onClick={list.reset}><RotateCcw className="h-3.5 w-3.5" /> Reset</button>}
      </div>
      <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.refresh} sort={list.sort} onSort={list.setSort} pagination={list.pagination} onPage={list.setPage} />
    </>
  );
}
