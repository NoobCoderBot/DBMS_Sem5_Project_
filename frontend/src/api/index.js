import client, { crud } from './client.js';

const data = (p) => p.then((r) => r.data);

export const productsApi = {
  ...crud('/products'),
  categories: () => client.get('/products/categories').then((r) => r.data.data),
};
export const suppliersApi = crud('/suppliers');
export const customersApi = crud('/customers');
export const warehousesApi = crud('/warehouses');
export const usersApi = crud('/users');

export const authApi = {
  login: (body) => data(client.post('/auth/login', body)),
  register: (body) => data(client.post('/auth/register', body)),
  me: () => data(client.get('/auth/me')),
  updateProfile: (body) => data(client.put('/auth/profile', body)),
  changePassword: (body) => data(client.put('/auth/change-password', body)),
};

export const inventoryApi = {
  list: (params) => data(client.get('/inventory', { params })),
  byWarehouse: (id, params) => data(client.get(`/inventory/warehouse/${id}`, { params })),
  byProduct: (id, params) => data(client.get(`/inventory/product/${id}`, { params })),
  adjust: (body) => data(client.post('/inventory/adjustments', body)).then((r) => r.data),
};

export const ordersApi = {
  ...crud('/orders'),
  action: (id, action, body) => client.patch(`/orders/${id}/${action}`, body).then((r) => r.data),
};

export const movementsApi = {
  list: (params) => data(client.get('/stock-movements', { params })),
};

export const reportsApi = {
  get: (name, params) => data(client.get(`/reports/${name}`, { params })),
  dashboard: () => data(client.get('/reports/dashboard')).then((r) => r.data),
};
