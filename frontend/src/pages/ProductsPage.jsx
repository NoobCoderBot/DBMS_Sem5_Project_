import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { productsApi } from '../api/index.js';
import ResourcePage from '../components/ResourcePage.jsx';
import { StatusBadge } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatCurrency, formatNumber } from '../utils/format.js';

const UNITS = ['pcs', 'kg', 'g', 'l', 'ml', 'm', 'box', 'pack', 'carton', 'pair', 'set'].map((u) => ({ value: u, label: u }));
const STATUS = [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }];

const baseConfig = {
  title: 'Products',
  description: 'Catalogue of items you buy, store and sell.',
  singular: 'Product',
  nameKey: 'productName',
  api: productsApi,
  searchPlaceholder: 'Search name, SKU, brand or barcode',
  initialParams: {},
  columns: [
    { key: 'productName', label: 'Product', sortKey: 'productName', render: (r) => (<div><p className="font-medium text-zinc-900">{r.productName}</p><p className="text-xs text-zinc-500">{r.SKU}</p></div>) },
    { key: 'category', label: 'Category', sortKey: 'category' },
    { key: 'brand', label: 'Brand', render: (r) => r.brand || '-' },
    { key: 'costPrice', label: 'Cost', align: 'right', sortKey: 'costPrice', render: (r) => formatCurrency(r.costPrice) },
    { key: 'sellingPrice', label: 'Price', align: 'right', sortKey: 'sellingPrice', render: (r) => formatCurrency(r.sellingPrice) },
    { key: 'totalQuantity', label: 'In stock', align: 'right', render: (r) => `${formatNumber(r.totalQuantity)} ${r.unit}` },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { name: 'productName', label: 'Product name', required: true, minLength: 2, maxLength: 150 },
    { name: 'SKU', label: 'SKU', required: true, minLength: 2, maxLength: 50, hint: 'Unique stock keeping unit, stored in upper case.' },
    { name: 'category', label: 'Category', required: true, minLength: 2, maxLength: 80 },
    { name: 'brand', label: 'Brand', maxLength: 80 },
    { name: 'unit', label: 'Unit', type: 'select', options: UNITS, noEmpty: true, defaultValue: 'pcs' },
    { name: 'barcode', label: 'Barcode', maxLength: 50 },
    { name: 'costPrice', label: 'Cost price (INR)', type: 'number', required: true, min: 0 },
    { name: 'sellingPrice', label: 'Selling price (INR)', type: 'number', required: true, min: 0 },
    { name: 'reorderLevel', label: 'Reorder level', type: 'number', min: 0, step: 1, defaultValue: 10, hint: 'Low-stock alerts trigger at or below this total quantity.' },
    { name: 'status', label: 'Status', type: 'select', options: STATUS, noEmpty: true, defaultValue: 'Active' },
    { name: 'description', label: 'Description', type: 'textarea', wide: true, maxLength: 1000 },
  ],
  detailItems: (p) => [
    ['Product name', p.productName], ['SKU', p.SKU], ['Category', p.category], ['Brand', p.brand], ['Unit', p.unit], ['Barcode', p.barcode],
    ['Cost price', formatCurrency(p.costPrice)], ['Selling price', formatCurrency(p.sellingPrice)], ['Reorder level', p.reorderLevel],
    ['Status', <StatusBadge status={p.status} />], ['Total stock', `${formatNumber(p.totalQuantity)} ${p.unit}`], ['Description', p.description],
  ],
  detailExtra: (p) => (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Stock by warehouse</h3>
      {p.stock?.length ? (
        <table className="w-full text-sm">
          <thead><tr><th className="th">Warehouse</th><th className="th text-right">On hand</th><th className="th text-right">Reserved</th><th className="th text-right">Available</th></tr></thead>
          <tbody>
            {p.stock.map((s) => (
              <tr key={s._id}>
                <td className="td">{s.warehouse?.warehouseName}</td>
                <td className="td text-right tabular-nums">{s.quantity}</td>
                <td className="td text-right tabular-nums">{s.reservedQuantity}</td>
                <td className="td text-right tabular-nums">{s.availableQuantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-zinc-500">This product is not stocked in any warehouse yet.</p>
      )}
    </div>
  ),
};

export default function ProductsPage() {
  const { canManage } = useAuth();
  const [params] = useSearchParams();
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    productsApi.categories().then(setCategories).catch(() => {});
  }, []);

  const config = useMemo(
    () => ({
      ...baseConfig,
      initialParams: { search: params.get('search') || '' },
      filters: [
        { key: 'category', label: 'Category', options: categories },
        { key: 'status', label: 'Status', options: ['Active', 'Inactive'] },
      ],
    }),
    [categories, params]
  );

  return <ResourcePage key={params.get('search') || ''} config={config} permissions={{ create: canManage, update: canManage, remove: canManage }} />;
}
