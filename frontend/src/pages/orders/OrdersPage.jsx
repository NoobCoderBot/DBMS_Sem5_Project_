import { Link, useNavigate } from 'react-router-dom';
import { Plus, RotateCcw } from 'lucide-react';
import { ordersApi } from '../../api/index.js';
import { useList } from '../../hooks/useList.js';
import { useAuth } from '../../context/AuthContext.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { FilterSelect, PageHeader, SearchInput, StatusBadge } from '../../components/ui/index.jsx';
import { formatCurrency, formatDate, ORDER_STATUSES, ORDER_TYPE_META } from '../../utils/format.js';

const DESCRIPTIONS = {
  purchase: 'Buy stock from suppliers. Inventory increases only when goods are received.',
  sale: 'Sell stock to customers. Confirming reserves stock; shipping deducts it.',
  transfer: 'Move stock between warehouses with a full movement trail.',
};

export default function OrdersPage({ type }) {
  const meta = ORDER_TYPE_META[type];
  const { canManage } = useAuth();
  const navigate = useNavigate();
  const list = useList((p) => ordersApi.list(p), { orderType: type, sortBy: 'orderDate', order: 'desc' });
  const canCreate = type === 'sale' ? true : canManage;

  const partyColumn =
    type === 'purchase'
      ? { key: 'party', label: 'Supplier', render: (r) => r.supplier?.supplierName }
      : type === 'sale'
        ? { key: 'party', label: 'Customer', render: (r) => r.customer?.customerName }
        : { key: 'party', label: 'Route', render: (r) => `${r.sourceWarehouse?.warehouseName} → ${r.destinationWarehouse?.warehouseName}` };

  const columns = [
    { key: 'orderNumber', label: 'Order', sortKey: 'orderNumber', render: (r) => <Link className="font-medium text-brand-700 hover:underline" to={`${meta.base}/${r._id}`} onClick={(e) => e.stopPropagation()}>{r.orderNumber}</Link> },
    partyColumn,
    ...(type !== 'transfer' ? [{ key: 'warehouse', label: type === 'purchase' ? 'Receiving warehouse' : 'Ship from', render: (r) => (type === 'purchase' ? r.destinationWarehouse : r.sourceWarehouse)?.warehouseName }] : []),
    { key: 'items', label: 'Items', align: 'right', render: (r) => r.items.length },
    { key: 'orderDate', label: 'Order date', sortKey: 'orderDate', render: (r) => formatDate(r.orderDate) },
    { key: 'status', label: 'Status', sortKey: 'status', render: (r) => <StatusBadge status={r.status} /> },
    ...(type !== 'transfer' ? [{ key: 'grandTotal', label: 'Total', align: 'right', sortKey: 'grandTotal', render: (r) => formatCurrency(r.grandTotal) }] : []),
    { key: 'createdBy', label: 'Created by', render: (r) => <span className="text-zinc-500">{r.createdBy?.name}</span> },
  ];

  const hasFilters = ['search', 'status', 'from', 'to'].some((k) => list.params[k]);

  return (
    <>
      <PageHeader
        title={meta.plural}
        description={DESCRIPTIONS[type]}
        actions={canCreate && <Link to={`${meta.base}/new`} className="btn-primary"><Plus className="h-4 w-4" /> New {meta.label.toLowerCase()}</Link>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput className="w-full sm:w-72" value={list.params.search} onChange={(v) => list.setParam('search', v)} placeholder={`Search number, ${type === 'purchase' ? 'supplier' : type === 'sale' ? 'customer' : 'warehouse'}`} />
        <FilterSelect label="Status" options={ORDER_STATUSES[type]} value={list.params.status} onChange={(v) => list.setParam('status', v)} />
        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          From <input type="date" className="input w-auto" value={list.params.from || ''} max={list.params.to || undefined} onChange={(e) => list.setParam('from', e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          To <input type="date" className="input w-auto" value={list.params.to || ''} min={list.params.from || undefined} onChange={(e) => list.setParam('to', e.target.value)} />
        </label>
        {hasFilters && <button className="btn-ghost" onClick={() => list.reset({ orderType: type, sortBy: 'orderDate', order: 'desc' })}><RotateCcw className="h-3.5 w-3.5" /> Reset</button>}
      </div>
      <DataTable
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        sort={list.sort}
        onSort={list.setSort}
        pagination={list.pagination}
        onPage={list.setPage}
        onRowClick={(r) => navigate(`${meta.base}/${r._id}`)}
      />
    </>
  );
}
