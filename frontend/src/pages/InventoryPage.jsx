import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { inventoryApi, productsApi, warehousesApi } from '../api/index.js';
import { parseError } from '../api/client.js';
import { useList } from '../hooks/useList.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { FilterSelect, PageHeader, SearchInput, Spinner, StatusBadge } from '../components/ui/index.jsx';
import { Field } from '../components/forms/Field.jsx';
import { formatDateTime, formatNumber } from '../utils/format.js';

function AdjustModal({ row, onClose, onDone }) {
  const toast = useToast();
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: { type: 'increase', quantity: '', reason: '' } });
  const type = watch('type');

  const submit = handleSubmit(async (v) => {
    try {
      await inventoryApi.adjust({ product: row.product._id, warehouse: row.warehouse._id, type: v.type, quantity: Number(v.quantity), reason: v.reason });
      toast.success('Stock adjusted and recorded in the ledger');
      onDone();
    } catch (err) {
      const { message, fieldErrors } = parseError(err);
      fieldErrors.forEach((e) => e.field && setError(e.field, { message: e.message }));
      toast.error(message);
    }
  });

  return (
    <Modal
      open
      onClose={isSubmitting ? () => {} : onClose}
      title="Adjust stock"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={isSubmitting}>{isSubmitting && <Spinner />} Apply adjustment</button>
        </>
      }
    >
      <div className="mb-4 rounded-md bg-zinc-50 p-3">
        <p className="font-medium text-zinc-900">{row.product.productName} <span className="text-xs font-normal text-zinc-500">{row.product.SKU}</span></p>
        <p className="text-xs text-zinc-500">{row.warehouse.warehouseName} &middot; On hand {row.quantity}, reserved {row.reservedQuantity}, available {row.availableQuantity}</p>
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Adjustment" htmlFor="type">
            <select id="type" className="input" {...register('type')}>
              <option value="increase">Increase stock</option>
              <option value="decrease">Decrease stock</option>
            </select>
          </Field>
          <Field label="Quantity" required error={errors.quantity} htmlFor="quantity" hint={type === 'decrease' ? `At most ${row.availableQuantity} (unreserved units)` : undefined}>
            <input id="quantity" type="number" min="1" step="1" className={`input ${errors.quantity ? 'input-error' : ''}`} {...register('quantity', { required: 'Quantity is required', min: { value: 1, message: 'Must be at least 1' }, validate: (v) => Number.isInteger(Number(v)) || 'Whole numbers only' })} />
          </Field>
        </div>
        <Field label="Reason" required error={errors.reason} htmlFor="reason">
          <textarea id="reason" rows={3} placeholder="e.g. Damaged goods, cycle count correction" className={`input ${errors.reason ? 'input-error' : ''}`} {...register('reason', { required: 'A reason is required', minLength: { value: 3, message: 'Please give a meaningful reason' } })} />
        </Field>
      </form>
    </Modal>
  );
}

export default function InventoryPage() {
  const { canManage } = useAuth();
  const [qs] = useSearchParams();
  const list = useList((p) => inventoryApi.list(p), {
    lowStock: qs.get('lowStock') === 'true' || undefined,
    warehouse: qs.get('warehouse') || '',
    product: qs.get('product') || '',
    sortBy: 'lastUpdated',
    order: 'desc',
  });
  const [warehouses, setWarehouses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [adjusting, setAdjusting] = useState(null);

  useEffect(() => {
    warehousesApi.list({ limit: 100 }).then((r) => setWarehouses(r.data.map((w) => ({ value: w._id, label: w.warehouseName })))).catch(() => {});
    productsApi.categories().then(setCategories).catch(() => {});
  }, []);

  const columns = [
    { key: 'product', label: 'Product', sortKey: 'productName', render: (r) => (<div><p className="font-medium text-zinc-900">{r.product.productName}</p><p className="text-xs text-zinc-500">{r.product.SKU} &middot; {r.product.category}</p></div>) },
    { key: 'warehouse', label: 'Warehouse', sortKey: 'warehouseName', render: (r) => r.warehouse.warehouseName },
    { key: 'quantity', label: 'On hand', align: 'right', sortKey: 'quantity', render: (r) => formatNumber(r.quantity) },
    { key: 'reserved', label: 'Reserved', align: 'right', render: (r) => formatNumber(r.reservedQuantity) },
    { key: 'available', label: 'Available', align: 'right', sortKey: 'availableQuantity', render: (r) => <b className="font-semibold text-zinc-900">{formatNumber(r.availableQuantity)}</b> },
    { key: 'reorder', label: 'Reorder lvl', align: 'right', render: (r) => r.product.reorderLevel },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.stockStatus} /> },
    { key: 'lastUpdated', label: 'Updated', sortKey: 'lastUpdated', render: (r) => <span className="whitespace-nowrap text-xs text-zinc-500">{formatDateTime(r.lastUpdated)}</span> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          {canManage && (
            <button className="btn-secondary btn-sm" onClick={() => setAdjusting(r)}>
              <SlidersHorizontal className="h-3.5 w-3.5" /> Adjust
            </button>
          )}
          {canManage && <Link className="btn-ghost btn-sm" to={`/stock-movements?product=${r.product._id}&warehouse=${r.warehouse._id}`}>History</Link>}
        </div>
      ),
    },
  ];

  const hasFilters = ['search', 'warehouse', 'category', 'stockStatus', 'lowStock', 'product'].some((k) => list.params[k]);

  return (
    <>
      <PageHeader title="Inventory" description="Stock on hand, reserved and available per product and warehouse." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput className="w-full sm:w-72" value={list.params.search} onChange={(v) => list.setParam('search', v)} placeholder="Search product, SKU or warehouse" />
        <FilterSelect label="Warehouse" options={warehouses} value={list.params.warehouse} onChange={(v) => list.setParam('warehouse', v)} />
        <FilterSelect label="Category" options={categories} value={list.params.category} onChange={(v) => list.setParam('category', v)} />
        <FilterSelect
          label="Stock status"
          options={[{ value: 'in-stock', label: 'In stock' }, { value: 'low-stock', label: 'Low stock' }, { value: 'out-of-stock', label: 'Out of stock' }]}
          value={list.params.stockStatus || (list.params.lowStock ? 'low-stock' : '')}
          onChange={(v) => { list.setParam('lowStock', undefined); list.setParam('stockStatus', v); }}
        />
        {hasFilters && <button className="btn-ghost" onClick={list.reset}><RotateCcw className="h-3.5 w-3.5" /> Reset</button>}
      </div>
      <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.refresh} sort={list.sort} onSort={list.setSort} pagination={list.pagination} onPage={list.setPage} />
      {adjusting && <AdjustModal row={adjusting} onClose={() => setAdjusting(null)} onDone={() => { setAdjusting(null); list.refresh(); }} />}
    </>
  );
}
