const currencyFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const currencyCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });
const numberFmt = new Intl.NumberFormat('en-IN');

export const formatCurrency = (n) => currencyFmt.format(Number(n) || 0);
export const formatCurrencyCompact = (n) => currencyCompact.format(Number(n) || 0);
export const formatNumber = (n) => numberFmt.format(Number(n) || 0);

export const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
export const formatDateTime = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '-';
export const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

/** Badge tone per status / movement type. */
export const STATUS_TONE = {
  Active: 'green',
  Inactive: 'gray',
  Draft: 'gray',
  Ordered: 'blue',
  'Partially Received': 'amber',
  Received: 'green',
  Confirmed: 'blue',
  Processing: 'amber',
  Shipped: 'indigo',
  Delivered: 'green',
  Pending: 'gray',
  'In Transit': 'indigo',
  Completed: 'green',
  Cancelled: 'red',
  'in-stock': 'green',
  'low-stock': 'amber',
  'out-of-stock': 'red',
  Purchase: 'green',
  Sale: 'blue',
  'Transfer In': 'indigo',
  'Transfer Out': 'amber',
  Adjustment: 'gray',
  Return: 'amber',
};

export const STOCK_STATUS_LABEL = { 'in-stock': 'In stock', 'low-stock': 'Low stock', 'out-of-stock': 'Out of stock' };

export const ORDER_TYPE_META = {
  purchase: { label: 'Purchase Order', plural: 'Purchase Orders', base: '/purchase-orders', prefix: 'PO' },
  sale: { label: 'Sales Order', plural: 'Sales Orders', base: '/sales-orders', prefix: 'SO' },
  transfer: { label: 'Stock Transfer', plural: 'Stock Transfers', base: '/stock-transfers', prefix: 'TR' },
};

export const ORDER_STATUSES = {
  purchase: ['Draft', 'Ordered', 'Partially Received', 'Received', 'Cancelled'],
  sale: ['Draft', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
  transfer: ['Pending', 'In Transit', 'Completed', 'Cancelled'],
};

export const MOVEMENT_TYPES = ['Purchase', 'Sale', 'Transfer In', 'Transfer Out', 'Adjustment', 'Return'];

/** Download rows as a CSV file. columns: [{ label, value: (row) => any }] */
export function downloadCsv(filename, columns, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(c.value(r))).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
