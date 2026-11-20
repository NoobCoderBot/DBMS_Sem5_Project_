import axios from 'axios';

const TOKEN_KEY = 'stockflow_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

const client = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 20000 });

client.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (error) => {
    const isAuthCall = error.config?.url?.startsWith('/auth/login') || error.config?.url?.startsWith('/auth/register');
    if (error.response?.status === 401 && !isAuthCall) {
      tokenStore.clear();
      window.dispatchEvent(new Event('stockflow:unauthorized'));
    }
    return Promise.reject(error);
  }
);

/** Normalises any axios error into { message, fieldErrors } for display. */
export function parseError(error) {
  const data = error?.response?.data;
  if (data?.message) return { message: data.message, fieldErrors: data.errors || [], status: error.response.status };
  if (error?.code === 'ECONNABORTED') return { message: 'The request timed out. Please try again.', fieldErrors: [] };
  if (error?.request) return { message: 'Cannot reach the server. Check that the API is running.', fieldErrors: [] };
  return { message: error?.message || 'Something went wrong', fieldErrors: [] };
}

/** Generic REST helper for a resource path, e.g. crud('/products'). */
export const crud = (path) => ({
  list: (params) => client.get(path, { params }).then((r) => r.data),
  get: (id) => client.get(`${path}/${id}`).then((r) => r.data.data),
  create: (body) => client.post(path, body).then((r) => r.data.data),
  update: (id, body) => client.put(`${path}/${id}`, body).then((r) => r.data.data),
  remove: (id) => client.delete(`${path}/${id}`).then((r) => r.data),
});

export default client;
