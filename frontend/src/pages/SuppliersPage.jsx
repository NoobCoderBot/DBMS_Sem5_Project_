import { suppliersApi } from '../api/index.js';
import ResourcePage from '../components/ResourcePage.jsx';
import { StatusBadge } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const STATUS = [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }];
const GSTIN = /^\d{2}[A-Za-z]{5}\d{4}[A-Za-z][1-9A-Za-z]Z[0-9A-Za-z]$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+\-\s()]{6,20}$/;

const config = {
  title: 'Suppliers',
  description: 'Vendors you purchase stock from.',
  singular: 'Supplier',
  nameKey: 'supplierName',
  api: suppliersApi,
  searchPlaceholder: 'Search name, contact, email, phone or GSTIN',
  filters: [{ key: 'status', label: 'Status', options: ['Active', 'Inactive'] }],
  columns: [
    { key: 'supplierName', label: 'Supplier', sortKey: 'supplierName', render: (r) => (<div><p className="font-medium text-zinc-900">{r.supplierName}</p><p className="text-xs text-zinc-500">{r.contactPerson || '-'}</p></div>) },
    { key: 'email', label: 'Email', render: (r) => r.email || '-' },
    { key: 'phone', label: 'Phone', render: (r) => r.phone || '-' },
    { key: 'GSTIN', label: 'GSTIN', render: (r) => r.GSTIN || '-' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { name: 'supplierName', label: 'Supplier name', required: true, minLength: 2, maxLength: 150 },
    { name: 'contactPerson', label: 'Contact person', maxLength: 100 },
    { name: 'email', label: 'Email', type: 'email', pattern: EMAIL, patternMessage: 'Enter a valid email' },
    { name: 'phone', label: 'Phone', pattern: PHONE, patternMessage: 'Enter a valid phone number' },
    { name: 'GSTIN', label: 'GSTIN', pattern: GSTIN, patternMessage: 'GSTIN must be 15 characters, e.g. 33ABCDE1234F1Z5' },
    { name: 'status', label: 'Status', type: 'select', options: STATUS, noEmpty: true, defaultValue: 'Active' },
    { name: 'address', label: 'Address', type: 'textarea', wide: true, maxLength: 300 },
  ],
  detailItems: (s) => [
    ['Supplier', s.supplierName], ['Contact person', s.contactPerson], ['Email', s.email], ['Phone', s.phone], ['GSTIN', s.GSTIN],
    ['Status', <StatusBadge status={s.status} />], ['Purchase orders', s.orderCount], ['Address', s.address],
  ],
};

export default function SuppliersPage() {
  const { canManage } = useAuth();
  return <ResourcePage config={config} permissions={{ create: canManage, update: canManage, remove: canManage }} />;
}
