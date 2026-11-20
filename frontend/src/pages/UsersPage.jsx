import { warehousesApi, usersApi } from '../api/index.js';
import ResourcePage from '../components/ResourcePage.jsx';
import { Badge, StatusBadge } from '../components/ui/index.jsx';
import { formatDateTime } from '../utils/format.js';

const ROLES = ['Admin', 'Inventory Manager', 'Staff'];
const ROLE_TONE = { Admin: 'indigo', 'Inventory Manager': 'blue', Staff: 'gray' };

const config = {
  title: 'User Management',
  description: 'Create accounts, assign roles and warehouses, and deactivate access.',
  singular: 'User',
  nameKey: 'name',
  api: usersApi,
  searchPlaceholder: 'Search name or email',
  filters: [
    { key: 'role', label: 'Role', options: ROLES },
    { key: 'status', label: 'Status', options: ['Active', 'Inactive'] },
  ],
  columns: [
    { key: 'name', label: 'Name', sortKey: 'name', render: (r) => (<div><p className="font-medium text-zinc-900">{r.name}</p><p className="text-xs text-zinc-500">{r.email}</p></div>) },
    { key: 'role', label: 'Role', sortKey: 'role', render: (r) => <Badge tone={ROLE_TONE[r.role]}>{r.role}</Badge> },
    { key: 'assignedWarehouse', label: 'Warehouse', render: (r) => r.assignedWarehouse?.warehouseName || '-' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'createdAt', label: 'Joined', sortKey: 'createdAt', render: (r) => formatDateTime(r.createdAt) },
  ],
  fields: [
    { name: 'name', label: 'Full name', required: true, minLength: 2, maxLength: 100 },
    { name: 'email', label: 'Email', type: 'email', required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMessage: 'Enter a valid email' },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      required: true,
      optionalOnEdit: true,
      minLength: 8,
      validate: (v) => !v || (/[A-Za-z]/.test(v) && /\d/.test(v)) || 'Include a letter and a number',
      hint: 'At least 8 characters with a letter and a number.',
      editHint: 'Leave blank to keep the current password.',
    },
    { name: 'role', label: 'Role', type: 'select', options: ROLES.map((r) => ({ value: r, label: r })), noEmpty: true, defaultValue: 'Staff' },
    { name: 'status', label: 'Status', type: 'select', options: [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }], noEmpty: true, defaultValue: 'Active' },
    {
      name: 'assignedWarehouse',
      label: 'Assigned warehouse',
      type: 'select',
      emptyLabel: 'None',
      fromItem: (u) => u.assignedWarehouse?._id || '',
      loadOptions: () => warehousesApi.list({ limit: 100 }).then((r) => r.data.map((w) => ({ value: w._id, label: w.warehouseName }))).catch(() => []),
    },
  ],
  detailItems: (u) => [
    ['Name', u.name], ['Email', u.email], ['Role', <Badge tone={ROLE_TONE[u.role]}>{u.role}</Badge>], ['Status', <StatusBadge status={u.status} />],
    ['Assigned warehouse', u.assignedWarehouse?.warehouseName], ['Joined', formatDateTime(u.createdAt)],
  ],
};

export default function UsersPage() {
  return <ResourcePage config={config} permissions={{ create: true, update: true, remove: true }} />;
}
