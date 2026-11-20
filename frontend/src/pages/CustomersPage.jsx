import { customersApi } from '../api/index.js';
import ResourcePage from '../components/ResourcePage.jsx';
import { StatusBadge } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const STATUS = [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }];
const GSTIN = /^\d{2}[A-Za-z]{5}\d{4}[A-Za-z][1-9A-Za-z]Z[0-9A-Za-z]$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+\-\s()]{6,20}$/;

const config = {
  title: 'Customers',
  description: 'Buyers you sell stock to.',
  singular: 'Customer',
  nameKey: 'customerName',
  api: customersApi,
  searchPlaceholder: 'Search name, email, phone or GSTIN',
  filters: [{ key: 'status', label: 'Status', options: ['Active', 'Inactive'] }],
  columns: [
    { key: 'customerName', label: 'Customer', sortKey: 'customerName', render: (r) => <span className="font-medium text-zinc-900">{r.customerName}</span> },
    { key: 'email', label: 'Email', render: (r) => r.email || '-' },
    { key: 'phone', label: 'Phone', render: (r) => r.phone || '-' },
    { key: 'GSTIN', label: 'GSTIN', render: (r) => r.GSTIN || '-' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { name: 'customerName', label: 'Customer name', required: true, minLength: 2, maxLength: 150 },
    { name: 'email', label: 'Email', type: 'email', pattern: EMAIL, patternMessage: 'Enter a valid email' },
    { name: 'phone', label: 'Phone', pattern: PHONE, patternMessage: 'Enter a valid phone number' },
    { name: 'GSTIN', label: 'GSTIN', pattern: GSTIN, patternMessage: 'GSTIN must be 15 characters, e.g. 33ABCDE1234F1Z5' },
    { name: 'status', label: 'Status', type: 'select', options: STATUS, noEmpty: true, defaultValue: 'Active' },
    { name: 'address', label: 'Address', type: 'textarea', wide: true, maxLength: 300 },
  ],
  detailItems: (c) => [
    ['Customer', c.customerName], ['Email', c.email], ['Phone', c.phone], ['GSTIN', c.GSTIN],
    ['Status', <StatusBadge status={c.status} />], ['Sales orders', c.orderCount], ['Address', c.address],
  ],
};

export default function CustomersPage() {
  const { canManage } = useAuth();
  // every role can register customers while taking orders; editing/deleting is reserved for managers
  return <ResourcePage config={config} permissions={{ create: true, update: canManage, remove: canManage }} />;
}
