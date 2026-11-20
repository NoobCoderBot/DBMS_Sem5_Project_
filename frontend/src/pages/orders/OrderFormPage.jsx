import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { customersApi, inventoryApi, ordersApi, suppliersApi, warehousesApi } from '../../api/index.js';
import { parseError } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAsync } from '../../hooks/useList.js';
import { Field } from '../../components/forms/Field.jsx';
import ProductPicker from '../../components/forms/ProductPicker.jsx';
import { ErrorState, LoadingBlock, PageHeader, Spinner } from '../../components/ui/index.jsx';
import { formatCurrency, ORDER_TYPE_META, toDateInput } from '../../utils/format.js';

const today = () => new Date().toISOString().slice(0, 10);
const EDITABLE = { purchase: 'Draft', sale: 'Draft', transfer: 'Pending' };

/** Shows live available stock at the source warehouse for one product row. */
function StockHint({ warehouse, product, quantity }) {
  const [available, setAvailable] = useState(null);
  useEffect(() => {
    if (!warehouse || !product) { setAvailable(null); return undefined; }
    let cancelled = false;
    inventoryApi
      .list({ warehouse, product: product._id, limit: 1 })
      .then((r) => !cancelled && setAvailable(r.data[0]?.availableQuantity ?? 0))
      .catch(() => !cancelled && setAvailable(null));
    return () => { cancelled = true; };
  }, [warehouse, product]);

  if (available === null) return null;
  const short = Number(quantity) > available;
  return <p className={`mt-1 text-xs ${short ? 'font-medium text-red-600' : 'text-zinc-500'}`}>{short ? `Only ${available} available at this warehouse` : `${available} available`}</p>;
}

function useOptions(loader, deps = []) {
  const { data } = useAsync(loader, deps);
  return data || [];
}

export default function OrderFormPage({ type }) {
  const meta = ORDER_TYPE_META[type];
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { canManage } = useAuth();
  const [submitError, setSubmitError] = useState('');

  const order = useAsync(() => (id ? ordersApi.get(id) : Promise.resolve(null)), [id]);
  const suppliers = useOptions(() => (type === 'purchase' ? suppliersApi.list({ limit: 100, status: 'Active', sortBy: 'supplierName', order: 'asc' }).then((r) => r.data) : Promise.resolve([])), [type]);
  const customers = useOptions(() => (type === 'sale' ? customersApi.list({ limit: 100, status: 'Active', sortBy: 'customerName', order: 'asc' }).then((r) => r.data) : Promise.resolve([])), [type]);
  const warehouses = useOptions(() => warehousesApi.list({ limit: 100, status: 'Active', sortBy: 'warehouseName', order: 'asc' }).then((r) => r.data));

  const { register, control, handleSubmit, reset, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { supplier: '', customer: '', sourceWarehouse: '', destinationWarehouse: '', items: [{ product: null, quantity: 1, unitPrice: '' }], tax: 0, discount: 0, orderDate: today(), expectedDeliveryDate: '', notes: '' },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  useEffect(() => {
    const o = order.data;
    if (!o) return;
    reset({
      supplier: o.supplier?._id || '',
      customer: o.customer?._id || '',
      sourceWarehouse: o.sourceWarehouse?._id || '',
      destinationWarehouse: o.destinationWarehouse?._id || '',
      items: o.items.map((i) => ({ product: i.product, quantity: i.quantity, unitPrice: i.unitPrice })),
      tax: o.tax,
      discount: o.discount,
      orderDate: toDateInput(o.orderDate),
      expectedDeliveryDate: toDateInput(o.expectedDeliveryDate),
      notes: o.notes || '',
    });
  }, [order.data, reset]);

  const items = watch('items');
  const tax = Number(watch('tax')) || 0;
  const discount = Number(watch('discount')) || 0;
  const sourceWarehouse = watch('sourceWarehouse');
  const destinationWarehouse = watch('destinationWarehouse');
  // computed every render: watch() returns the same mutated array reference, so memoising on it would go stale
  const subtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);
  const grandTotal = subtotal + tax - discount;
  const showMoney = type !== 'transfer';
  const chosenIds = items.map((i) => i.product?._id).filter(Boolean);

  if (isEdit && order.loading) return <LoadingBlock />;
  if (isEdit && order.error) return <ErrorState message={order.error} onRetry={order.reload} />;
  if (isEdit && order.data && order.data.status !== EDITABLE[type]) {
    return <ErrorState message={`This order is "${order.data.status}" and can no longer be edited.`} />;
  }

  const submit = handleSubmit(async (v) => {
    setSubmitError('');
    if (new Set(chosenIds).size !== chosenIds.length) return setSubmitError('The same product appears on more than one line.');
    if (type === 'transfer' && v.sourceWarehouse === v.destinationWarehouse) return setError('destinationWarehouse', { message: 'Source and destination must differ' });

    const payload = {
      orderType: type,
      items: v.items.map((i) => ({ product: i.product._id, quantity: Number(i.quantity), ...(type !== 'transfer' && i.unitPrice !== '' ? { unitPrice: Number(i.unitPrice) } : {}) })),
      tax: showMoney ? Number(v.tax) || 0 : 0,
      discount: showMoney ? Number(v.discount) || 0 : 0,
      orderDate: v.orderDate || undefined,
      expectedDeliveryDate: v.expectedDeliveryDate || null,
      notes: v.notes,
      ...(type === 'purchase' && { supplier: v.supplier, destinationWarehouse: v.destinationWarehouse }),
      ...(type === 'sale' && { customer: v.customer, sourceWarehouse: v.sourceWarehouse }),
      ...(type === 'transfer' && { sourceWarehouse: v.sourceWarehouse, destinationWarehouse: v.destinationWarehouse }),
    };
    try {
      const saved = isEdit ? await ordersApi.update(id, payload) : await ordersApi.create(payload);
      toast.success(`${meta.label} ${isEdit ? 'updated' : 'created'}`);
      navigate(`${meta.base}/${saved._id}`);
    } catch (err) {
      const { message, fieldErrors } = parseError(err);
      fieldErrors.forEach((e) => e.field && !e.field.includes('.') && setError(e.field, { message: e.message }));
      setSubmitError(message);
    }
  });

  const select = (name, label, opts, labelKey, extra = {}) => (
    <Field label={label} required error={errors[name]} htmlFor={name}>
      <select id={name} className={`input ${errors[name] ? 'input-error' : ''}`} {...register(name, { required: `${label} is required`, ...extra })}>
        <option value="">Select...</option>
        {opts.map((o) => <option key={o._id} value={o._id}>{o[labelKey]}{o.warehouseCode ? ` (${o.warehouseCode})` : ''}</option>)}
      </select>
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        title={`${isEdit ? 'Edit' : 'New'} ${meta.label.toLowerCase()}${isEdit ? ` ${order.data?.orderNumber || ''}` : ''}`}
        description={type === 'sale' ? 'Stock is validated against live availability. Confirming the order reserves it.' : type === 'purchase' ? 'Inventory increases only when you receive the goods.' : 'Stock moves when the transfer is dispatched / completed.'}
        actions={
          <>
            <Link to={isEdit ? `${meta.base}/${id}` : meta.base} className="btn-secondary">Cancel</Link>
            <button className="btn-primary" disabled={isSubmitting || (type !== 'sale' && !canManage)}>{isSubmitting && <Spinner />} {isEdit ? 'Save changes' : 'Save as draft'}</button>
          </>
        }
      />
      {submitError && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700" role="alert">{submitError}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="card p-5">
            <h2 className="mb-4 text-sm font-semibold">Order details</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {type === 'purchase' && select('supplier', 'Supplier', suppliers, 'supplierName')}
              {type === 'sale' && select('customer', 'Customer', customers, 'customerName')}
              {type !== 'purchase' && select('sourceWarehouse', type === 'sale' ? 'Ship from warehouse' : 'Source warehouse', warehouses, 'warehouseName')}
              {type !== 'sale' && select('destinationWarehouse', type === 'purchase' ? 'Receiving warehouse' : 'Destination warehouse', warehouses, 'warehouseName')}
              <Field label="Order date" htmlFor="orderDate"><input id="orderDate" type="date" className="input" {...register('orderDate')} /></Field>
              <Field label="Expected delivery" htmlFor="expectedDeliveryDate"><input id="expectedDeliveryDate" type="date" className="input" {...register('expectedDeliveryDate')} /></Field>
              <Field label="Notes" htmlFor="notes" className="sm:col-span-2"><textarea id="notes" rows={2} className="input" maxLength={1000} {...register('notes')} /></Field>
            </div>
          </section>

          <section className="card">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
              <h2 className="text-sm font-semibold">Products</h2>
              <button type="button" className="btn-secondary btn-sm" onClick={() => append({ product: null, quantity: 1, unitPrice: '' })}><Plus className="h-3.5 w-3.5" /> Add line</button>
            </div>
            <div className="divide-y divide-zinc-100">
              {fields.map((f, index) => {
                const row = items[index] || {};
                const lineTotal = (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0);
                const stockWarehouse = type === 'purchase' ? null : sourceWarehouse;
                return (
                  <div key={f.id} className="grid grid-cols-12 gap-3 px-5 py-3">
                    <div className="col-span-12 md:col-span-6">
                      <Controller
                        control={control}
                        name={`items.${index}.product`}
                        rules={{ required: 'Select a product' }}
                        render={({ field }) => (
                          <ProductPicker
                            value={field.value}
                            error={errors.items?.[index]?.product}
                            excludeIds={chosenIds}
                            onChange={(p) => {
                              field.onChange(p);
                              // default the unit price from the catalogue the first time a product is picked
                              if (p) setValue(`items.${index}.unitPrice`, type === 'sale' ? p.sellingPrice : p.costPrice);
                            }}
                          />
                        )}
                      />
                      {errors.items?.[index]?.product && <p className="mt-1 text-xs text-red-600">{errors.items[index].product.message}</p>}
                      {stockWarehouse && <StockHint warehouse={stockWarehouse} product={row.product} quantity={row.quantity} />}
                    </div>
                    <div className="col-span-5 md:col-span-2">
                      <input type="number" min="1" step="1" aria-label="Quantity" placeholder="Qty" className={`input ${errors.items?.[index]?.quantity ? 'input-error' : ''}`}
                        {...register(`items.${index}.quantity`, { required: 'Qty required', min: { value: 1, message: 'Min 1' }, validate: (v) => Number.isInteger(Number(v)) || 'Whole number' })} />
                      {errors.items?.[index]?.quantity && <p className="mt-1 text-xs text-red-600">{errors.items[index].quantity.message}</p>}
                    </div>
                    {showMoney ? (
                      <>
                        <div className="col-span-5 md:col-span-2">
                          <input type="number" min="0" step="0.01" aria-label="Unit price" placeholder="Unit price" className={`input ${errors.items?.[index]?.unitPrice ? 'input-error' : ''}`}
                            {...register(`items.${index}.unitPrice`, { required: 'Price required', min: { value: 0, message: 'Cannot be negative' } })} />
                          {errors.items?.[index]?.unitPrice && <p className="mt-1 text-xs text-red-600">{errors.items[index].unitPrice.message}</p>}
                        </div>
                        <div className="col-span-10 flex items-center justify-end text-right tabular-nums text-zinc-700 md:col-span-1">{formatCurrency(lineTotal)}</div>
                      </>
                    ) : <div className="hidden md:col-span-3 md:block" />}
                    <div className="col-span-2 flex items-start justify-end md:col-span-1">
                      <button type="button" className="btn-ghost btn-sm text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:text-zinc-300" disabled={fields.length === 1} onClick={() => remove(index)} aria-label="Remove line"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="lg:col-span-1">
          <section className="card sticky top-20 p-5">
            <h2 className="mb-4 text-sm font-semibold">Summary</h2>
            <dl className="space-y-2.5">
              <div className="flex justify-between"><dt className="text-zinc-500">Lines</dt><dd className="tabular-nums">{items.filter((i) => i.product).length}</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">Units</dt><dd className="tabular-nums">{items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)}</dd></div>
              {showMoney && (
                <>
                  <div className="flex justify-between"><dt className="text-zinc-500">Subtotal</dt><dd className="tabular-nums">{formatCurrency(subtotal)}</dd></div>
                  <div className="flex items-center justify-between gap-3"><dt className="text-zinc-500">Tax (INR)</dt><dd><input type="number" min="0" step="0.01" aria-label="Tax amount" className="input w-28 py-1 text-right" {...register('tax', { min: { value: 0, message: 'Cannot be negative' } })} /></dd></div>
                  <div className="flex items-center justify-between gap-3"><dt className="text-zinc-500">Discount (INR)</dt><dd><input type="number" min="0" step="0.01" aria-label="Discount amount" className="input w-28 py-1 text-right" {...register('discount', { min: { value: 0, message: 'Cannot be negative' } })} /></dd></div>
                  <div className="flex justify-between border-t border-zinc-200 pt-3 text-base font-semibold"><dt>Grand total</dt><dd className={`tabular-nums ${grandTotal < 0 ? 'text-red-600' : ''}`}>{formatCurrency(grandTotal)}</dd></div>
                  {grandTotal < 0 && <p className="text-xs text-red-600">Discount cannot exceed subtotal plus tax.</p>}
                </>
              )}
              {type === 'transfer' && sourceWarehouse && destinationWarehouse && sourceWarehouse === destinationWarehouse && <p className="text-xs text-red-600">Source and destination warehouses must differ.</p>}
            </dl>
          </section>
        </aside>
      </div>
    </form>
  );
}
