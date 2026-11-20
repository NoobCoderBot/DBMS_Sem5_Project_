import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, CheckCircle2, PackageCheck, Pencil, PlayCircle, Truck, Trash2, PackageOpen } from 'lucide-react';
import { movementsApi, ordersApi } from '../../api/index.js';
import { parseError } from '../../api/client.js';
import { useAsync } from '../../hooks/useList.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx';
import { DetailGrid, ErrorState, LoadingBlock, Spinner, StatusBadge } from '../../components/ui/index.jsx';
import { formatCurrency, formatDate, formatDateTime, ORDER_TYPE_META } from '../../utils/format.js';

/** Which workflow buttons exist for each type/status (the backend enforces the same transitions). */
const ACTIONS = {
  purchase: {
    Draft: ['edit', 'confirm', 'cancel', 'delete'],
    Ordered: ['receive', 'cancel'],
    'Partially Received': ['receive'],
    Cancelled: ['delete'],
  },
  sale: {
    Draft: ['edit', 'confirm', 'cancel', 'delete'],
    Confirmed: ['process', 'ship', 'cancel'],
    Processing: ['ship', 'cancel'],
    Shipped: ['deliver'],
    Cancelled: ['delete'],
  },
  transfer: {
    Pending: ['edit', 'ship', 'complete', 'cancel', 'delete'],
    'In Transit': ['complete', 'cancel'],
    Cancelled: ['delete'],
  },
};

const ACTION_META = {
  confirm: { label: (t) => (t === 'sale' ? 'Confirm & reserve stock' : 'Place order'), icon: CheckCircle2, primary: true, endpoint: 'confirm', done: 'Order confirmed' },
  process: { label: () => 'Start processing', icon: PlayCircle, endpoint: 'process', done: 'Order is now processing' },
  ship: { label: (t) => (t === 'sale' ? 'Ship order' : 'Dispatch'), icon: Truck, primary: true, endpoint: 'ship', done: 'Order shipped' },
  deliver: { label: () => 'Mark delivered', icon: PackageCheck, primary: true, endpoint: 'deliver', done: 'Order delivered' },
  complete: { label: () => 'Complete transfer', icon: PackageCheck, primary: true, endpoint: 'complete-transfer', done: 'Transfer completed' },
};

const CONFIRM_TEXT = {
  confirm: (t) => (t === 'sale' ? 'Stock for every line will be reserved at the source warehouse. If anything is short, nothing is reserved.' : 'The purchase order will be marked as placed with the supplier. Stock is added only when you receive goods.'),
  process: () => 'Move this order to processing.',
  ship: (t) => (t === 'sale' ? 'Reserved stock will be deducted from the warehouse and a Sale movement recorded for each line.' : 'Stock will be deducted from the source warehouse now (Transfer Out). Complete the transfer once it arrives.'),
  deliver: () => 'Mark this order as delivered to the customer.',
  complete: () => 'Stock will be moved to the destination warehouse and Transfer In movements recorded.',
};

function ReceiveModal({ order, onClose, onDone }) {
  const toast = useToast();
  const lines = order.items.filter((i) => i.quantity - i.receivedQuantity > 0);
  const [qty, setQty] = useState(() => Object.fromEntries(lines.map((i) => [i._id, i.quantity - i.receivedQuantity])));
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);

  const invalid = lines.some((i) => {
    const q = Number(qty[i._id]);
    return !Number.isInteger(q) || q < 0 || q > i.quantity - i.receivedQuantity;
  });
  const payload = lines.filter((i) => Number(qty[i._id]) > 0).map((i) => ({ itemId: i._id, quantity: Number(qty[i._id]) }));

  const submit = async () => {
    setBusy(true);
    try {
      await ordersApi.action(order._id, 'receive', { items: payload, remarks });
      toast.success('Stock received and inventory updated');
      onDone();
    } catch (err) {
      toast.error(parseError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Receive stock"
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={busy || invalid || payload.length === 0}>{busy && <Spinner />} Receive into {order.destinationWarehouse?.warehouseName}</button>
        </>
      }
    >
      <p className="mb-3 text-zinc-500">Enter the quantity actually received for each line. Receive less than ordered to record a partial delivery.</p>
      <table className="w-full text-sm">
        <thead><tr><th className="th">Product</th><th className="th text-right">Ordered</th><th className="th text-right">Received</th><th className="th text-right">Receive now</th></tr></thead>
        <tbody>
          {lines.map((i) => {
            const remaining = i.quantity - i.receivedQuantity;
            const q = Number(qty[i._id]);
            const bad = !Number.isInteger(q) || q < 0 || q > remaining;
            return (
              <tr key={i._id}>
                <td className="td">{i.product.productName} <span className="text-xs text-zinc-400">{i.product.SKU}</span></td>
                <td className="td text-right tabular-nums">{i.quantity}</td>
                <td className="td text-right tabular-nums">{i.receivedQuantity}</td>
                <td className="td text-right">
                  <input type="number" min="0" max={remaining} step="1" aria-label={`Receive quantity for ${i.product.productName}`} className={`input ml-auto w-24 py-1 text-right ${bad ? 'input-error' : ''}`} value={qty[i._id]} onChange={(e) => setQty((s) => ({ ...s, [i._id]: e.target.value }))} />
                  {bad && <p className="mt-0.5 text-xs text-red-600">0 to {remaining}</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-4">
        <label className="label" htmlFor="remarks">Remarks (optional)</label>
        <input id="remarks" className="input" value={remarks} maxLength={300} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Delivery challan no., condition of goods" />
      </div>
    </Modal>
  );
}

export default function OrderDetailPage({ type }) {
  const meta = ORDER_TYPE_META[type];
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { canManage } = useAuth();
  const { data: order, loading, error, reload } = useAsync(() => ordersApi.get(id), [id]);
  const movements = useAsync(() => (canManage ? movementsApi.list({ referenceOrder: id, limit: 50, sortBy: 'createdAt', order: 'asc' }).then((r) => r.data) : Promise.resolve([])), [id, canManage]);

  const [pending, setPending] = useState(null); // action awaiting confirmation
  const [busy, setBusy] = useState(false);
  const [cancelRemarks, setCancelRemarks] = useState('');
  const [receiving, setReceiving] = useState(false);

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (order.orderType !== type) return <ErrorState message="This order belongs to a different section." />;

  const canAct = type === 'sale' || canManage;
  const actions = canAct ? ACTIONS[type][order.status] || [] : [];

  const run = async () => {
    setBusy(true);
    try {
      if (pending === 'delete') {
        await ordersApi.remove(order._id);
        toast.success('Order deleted');
        navigate(meta.base);
        return;
      }
      if (pending === 'cancel') await ordersApi.action(order._id, 'cancel', { remarks: cancelRemarks });
      else await ordersApi.action(order._id, ACTION_META[pending].endpoint);
      toast.success(pending === 'cancel' ? 'Order cancelled' : ACTION_META[pending].done);
      setPending(null);
      setCancelRemarks('');
      reload();
      movements.reload();
    } catch (err) {
      toast.error(parseError(err).message);
      setPending(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const partyItems =
    type === 'purchase'
      ? [['Supplier', order.supplier?.supplierName], ['Contact', order.supplier?.contactPerson], ['Receiving warehouse', order.destinationWarehouse?.warehouseName]]
      : type === 'sale'
        ? [['Customer', order.customer?.customerName], ['Contact', order.customer?.email], ['Ship from', order.sourceWarehouse?.warehouseName]]
        : [['Source warehouse', order.sourceWarehouse?.warehouseName], ['Destination warehouse', order.destinationWarehouse?.warehouseName]];

  const primary = actions.filter((a) => ACTION_META[a]?.primary || a === 'receive');
  const secondary = actions.filter((a) => !(ACTION_META[a]?.primary || a === 'receive'));

  const renderAction = (a, isPrimary) => {
    const cls = isPrimary ? 'btn-primary' : a === 'cancel' || a === 'delete' ? 'btn-secondary text-red-600' : 'btn-secondary';
    if (a === 'edit') return <Link key={a} to={`${meta.base}/${order._id}/edit`} className={cls}><Pencil className="h-4 w-4" /> Edit</Link>;
    if (a === 'receive') return <button key={a} className={cls} onClick={() => setReceiving(true)}><PackageOpen className="h-4 w-4" /> Receive stock</button>;
    if (a === 'cancel') return <button key={a} className={cls} onClick={() => setPending('cancel')}><Ban className="h-4 w-4" /> Cancel order</button>;
    if (a === 'delete') return <button key={a} className={cls} onClick={() => setPending('delete')}><Trash2 className="h-4 w-4" /> Delete</button>;
    const m = ACTION_META[a];
    const Icon = m.icon;
    return <button key={a} className={cls} onClick={() => setPending(a)}><Icon className="h-4 w-4" /> {m.label(type)}</button>;
  };

  const showReceived = type === 'purchase';
  return (
    <>
      <Link to={meta.base} className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800"><ArrowLeft className="h-4 w-4" /> {meta.plural}</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{order.orderNumber}</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-0.5 text-zinc-500">{meta.label} created {formatDateTime(order.createdAt)} by {order.createdBy?.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {secondary.map((a) => renderAction(a, false))}
          {primary.map((a) => renderAction(a, true))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="card p-5">
            <h2 className="mb-4 text-sm font-semibold">Details</h2>
            <DetailGrid items={[...partyItems, ['Order date', formatDate(order.orderDate)], ['Expected delivery', formatDate(order.expectedDeliveryDate)], ['Notes', order.notes]]} />
          </section>

          <section className="card overflow-hidden">
            <h2 className="border-b border-zinc-100 px-5 py-3 text-sm font-semibold">Items</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="th">Product</th>
                    <th className="th text-right">Qty</th>
                    {showReceived && <th className="th text-right">Received</th>}
                    {type !== 'transfer' && <><th className="th text-right">Unit price</th><th className="th text-right">Subtotal</th></>}
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((i) => (
                    <tr key={i._id}>
                      <td className="td"><p className="font-medium text-zinc-900">{i.product.productName}</p><p className="text-xs text-zinc-500">{i.product.SKU}</p></td>
                      <td className="td text-right tabular-nums">{i.quantity} {i.product.unit}</td>
                      {showReceived && <td className={`td text-right tabular-nums ${i.receivedQuantity >= i.quantity ? 'text-emerald-700' : ''}`}>{i.receivedQuantity}</td>}
                      {type !== 'transfer' && <><td className="td text-right tabular-nums">{formatCurrency(i.unitPrice)}</td><td className="td text-right tabular-nums">{formatCurrency(i.subtotal)}</td></>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {canManage && (
            <section className="card overflow-hidden">
              <h2 className="border-b border-zinc-100 px-5 py-3 text-sm font-semibold">Stock movements from this order</h2>
              {movements.loading ? <LoadingBlock /> : (movements.data || []).length === 0 ? (
                <p className="px-5 py-6 text-zinc-500">No stock has moved for this order yet.{type === 'sale' && ' Reservations are not stock movements; stock moves when the order ships.'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead><tr><th className="th">When</th><th className="th">Product</th><th className="th">Warehouse</th><th className="th">Type</th><th className="th text-right">Qty</th><th className="th text-right">Before</th><th className="th text-right">After</th></tr></thead>
                    <tbody>
                      {movements.data.map((m) => (
                        <tr key={m._id}>
                          <td className="td whitespace-nowrap text-xs text-zinc-500">{formatDateTime(m.createdAt)}</td>
                          <td className="td">{m.product?.productName}</td>
                          <td className="td">{m.warehouse?.warehouseName}</td>
                          <td className="td"><StatusBadge status={m.movementType} /></td>
                          <td className={`td text-right tabular-nums font-medium ${m.quantity > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                          <td className="td text-right tabular-nums">{m.previousQuantity}</td>
                          <td className="td text-right tabular-nums">{m.newQuantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>

        {type !== 'transfer' && (
          <aside>
            <section className="card p-5">
              <h2 className="mb-4 text-sm font-semibold">Totals</h2>
              <dl className="space-y-2.5">
                <div className="flex justify-between"><dt className="text-zinc-500">Subtotal</dt><dd className="tabular-nums">{formatCurrency(order.subtotal)}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">Tax</dt><dd className="tabular-nums">{formatCurrency(order.tax)}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">Discount</dt><dd className="tabular-nums">-{formatCurrency(order.discount)}</dd></div>
                <div className="flex justify-between border-t border-zinc-200 pt-3 text-base font-semibold"><dt>Grand total</dt><dd className="tabular-nums">{formatCurrency(order.grandTotal)}</dd></div>
              </dl>
            </section>
          </aside>
        )}
      </div>

      {receiving && <ReceiveModal order={order} onClose={() => setReceiving(false)} onDone={() => { setReceiving(false); reload(); movements.reload(); }} />}

      <ConfirmDialog
        open={Boolean(pending)}
        danger={pending === 'cancel' || pending === 'delete'}
        loading={busy}
        title={pending === 'delete' ? 'Delete order?' : pending === 'cancel' ? 'Cancel order?' : pending ? ACTION_META[pending].label(type) : ''}
        message={
          pending === 'delete' ? `${order.orderNumber} will be permanently deleted.`
          : pending === 'cancel' ? (order.status === 'Confirmed' || order.status === 'Processing' ? 'Reserved stock will be released back to available inventory.' : order.status === 'In Transit' ? 'Stock already dispatched will be returned to the source warehouse.' : 'This order will be marked as cancelled.')
          : pending ? CONFIRM_TEXT[pending](type) : ''
        }
        confirmLabel={pending === 'delete' ? 'Delete' : pending === 'cancel' ? 'Cancel order' : 'Confirm'}
        onConfirm={run}
        onClose={() => setPending(null)}
      >
        {pending === 'cancel' && (
          <div className="mt-3">
            <label className="label" htmlFor="cancel-remarks">Reason (optional)</label>
            <input id="cancel-remarks" className="input" maxLength={300} value={cancelRemarks} onChange={(e) => setCancelRemarks(e.target.value)} />
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
