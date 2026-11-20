import { useEffect, useMemo, useState } from 'react';
import { inventoryApi, usersApi, warehousesApi } from '../api/index.js';
import ResourcePage from '../components/ResourcePage.jsx';
import { LoadingBlock, StatusBadge } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatNumber } from '../utils/format.js';

const STATUS = [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }];
const PHONE = /^[0-9+\-\s()]{6,20}$/;

function WarehouseStock({ warehouseId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    inventoryApi.byWarehouse(warehouseId, { limit: 10, sortBy: 'quantity', order: 'desc' }).then((r) => setRows(r.data)).catch(() => setRows([]));
  }, [warehouseId]);
  if (!rows) return <LoadingBlock />;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Top stocked products</h3>
      {rows.length === 0 ? (
        <p className="text-zinc-500">No stock in this warehouse yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr><th className="th">Product</th><th className="th text-right">On hand</th><th className="th text-right">Available</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td className="td">{r.product.productName} <span className="text-xs text-zinc-400">{r.product.SKU}</span></td>
                <td className="td text-right tabular-nums">{r.quantity}</td>
                <td className="td text-right tabular-nums">{r.availableQuantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function WarehousesPage() {
  const { canManage } = useAuth();
  const config = useMemo(
    () => ({
      title: 'Warehouses',
      description: 'Storage locations and their stock levels.',
      singular: 'Warehouse',
      nameKey: 'warehouseName',
      api: warehousesApi,
      searchPlaceholder: 'Search name, code or location',
      filters: [{ key: 'status', label: 'Status', options: ['Active', 'Inactive'] }],
      columns: [
        { key: 'warehouseName', label: 'Warehouse', sortKey: 'warehouseName', render: (r) => (<div><p className="font-medium text-zinc-900">{r.warehouseName}</p><p className="text-xs text-zinc-500">{r.warehouseCode}</p></div>) },
        { key: 'location', label: 'Location', render: (r) => r.location || '-' },
        { key: 'manager', label: 'Manager', render: (r) => r.manager?.name || '-' },
        { key: 'productCount', label: 'Products', align: 'right', render: (r) => formatNumber(r.productCount) },
        { key: 'totalStock', label: 'Total stock', align: 'right', render: (r) => formatNumber(r.totalStock) },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ],
      fields: [
        { name: 'warehouseName', label: 'Warehouse name', required: true, minLength: 2, maxLength: 120 },
        { name: 'warehouseCode', label: 'Warehouse code', required: true, minLength: 2, maxLength: 20, hint: 'Unique, stored in upper case.' },
        { name: 'location', label: 'City / location', maxLength: 120 },
        { name: 'contactNumber', label: 'Contact number', pattern: PHONE, patternMessage: 'Enter a valid phone number' },
        {
          name: 'manager',
          label: 'Manager',
          type: 'select',
          emptyLabel: 'No manager assigned',
          fromItem: (w) => w.manager?._id || '',
          loadOptions: () =>
            canManage
              ? usersApi.list({ limit: 100, status: 'Active' }).then((r) => r.data.filter((u) => u.role !== 'Staff').map((u) => ({ value: u._id, label: `${u.name} (${u.role})` }))).catch(() => [])
              : Promise.resolve([]),
        },
        { name: 'status', label: 'Status', type: 'select', options: STATUS, noEmpty: true, defaultValue: 'Active' },
        { name: 'address', label: 'Address', type: 'textarea', wide: true, maxLength: 300 },
      ],
      detailItems: (w) => [
        ['Warehouse', w.warehouseName], ['Code', w.warehouseCode], ['Location', w.location], ['Contact number', w.contactNumber],
        ['Manager', w.manager ? `${w.manager.name} (${w.manager.email})` : '-'], ['Status', <StatusBadge status={w.status} />],
        ['Products stocked', formatNumber(w.productCount)], ['Total stock (units)', formatNumber(w.totalStock)],
        ['Reserved units', formatNumber(w.reservedStock)], ['Address', w.address],
      ],
      detailExtra: (w) => <WarehouseStock warehouseId={w._id} />,
    }),
    [canManage]
  );

  return <ResourcePage config={config} permissions={{ create: canManage, update: canManage, remove: canManage }} />;
}
