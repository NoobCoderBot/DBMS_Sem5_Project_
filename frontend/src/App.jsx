import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout.jsx';
import { GuestOnly, RequireAuth, RequireRole } from './components/RouteGuards.jsx';
import { ROLES } from './context/AuthContext.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import RegisterPage from './pages/auth/RegisterPage.jsx';
import ProductsPage from './pages/ProductsPage.jsx';
import SuppliersPage from './pages/SuppliersPage.jsx';
import CustomersPage from './pages/CustomersPage.jsx';
import WarehousesPage from './pages/WarehousesPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import OrdersPage from './pages/orders/OrdersPage.jsx';
import OrderFormPage from './pages/orders/OrderFormPage.jsx';
import OrderDetailPage from './pages/orders/OrderDetailPage.jsx';
import StockMovementsPage from './pages/StockMovementsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

// chart-heavy pages are code-split so the initial bundle stays small
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));

const OPS = [ROLES.ADMIN, ROLES.MANAGER];

function orderRoutes(base, type) {
  return (
    <>
      <Route path={base} element={<OrdersPage type={type} />} />
      <Route path={`${base}/new`} element={<OrderFormPage type={type} />} />
      <Route path={`${base}/:id`} element={<OrderDetailPage type={type} />} />
      <Route path={`${base}/:id/edit`} element={<OrderFormPage type={type} />} />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="warehouses" element={<WarehousesPage />} />
          <Route path="customers" element={<CustomersPage />} />
          {orderRoutes('sales-orders', 'sale')}
          <Route path="settings" element={<SettingsPage />} />

          <Route element={<RequireRole roles={OPS} />}>
            <Route path="suppliers" element={<SuppliersPage />} />
            {orderRoutes('purchase-orders', 'purchase')}
            {orderRoutes('stock-transfers', 'transfer')}
            <Route path="stock-movements" element={<StockMovementsPage />} />
            <Route path="reports" element={<ReportsPage />} />
          </Route>

          <Route element={<RequireRole roles={[ROLES.ADMIN]} />}>
            <Route path="users" element={<UsersPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
