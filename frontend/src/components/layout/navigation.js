import {
  LayoutDashboard,
  Package,
  Boxes,
  Warehouse,
  Truck,
  Users,
  ShoppingCart,
  Receipt,
  ArrowLeftRight,
  History,
  BarChart3,
  UserCog,
  Settings,
} from 'lucide-react';
import { ROLES } from '../../context/AuthContext.jsx';

const ALL = [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF];
const OPS = [ROLES.ADMIN, ROLES.MANAGER];

export const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, roles: ALL, end: true, group: null },
  { to: '/products', label: 'Products', icon: Package, roles: ALL, group: 'Catalog' },
  { to: '/inventory', label: 'Inventory', icon: Boxes, roles: ALL, group: 'Catalog' },
  { to: '/warehouses', label: 'Warehouses', icon: Warehouse, roles: ALL, group: 'Catalog' },
  { to: '/suppliers', label: 'Suppliers', icon: Truck, roles: OPS, group: 'Partners' },
  { to: '/customers', label: 'Customers', icon: Users, roles: ALL, group: 'Partners' },
  { to: '/purchase-orders', label: 'Purchase Orders', icon: ShoppingCart, roles: OPS, group: 'Operations' },
  { to: '/sales-orders', label: 'Sales Orders', icon: Receipt, roles: ALL, group: 'Operations' },
  { to: '/stock-transfers', label: 'Stock Transfers', icon: ArrowLeftRight, roles: OPS, group: 'Operations' },
  { to: '/stock-movements', label: 'Stock Movements', icon: History, roles: OPS, group: 'Operations' },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: OPS, group: 'Insights' },
  { to: '/users', label: 'User Management', icon: UserCog, roles: [ROLES.ADMIN], group: 'Administration' },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ALL, group: 'Administration' },
];

export const ROUTE_TITLES = Object.fromEntries(NAV_ITEMS.map((n) => [n.to, n.label]));
