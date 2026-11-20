const { connect, disconnect, clearAll, makeUser, api } = require('./helpers');

beforeAll(() => connect('sf_auth'));
afterAll(disconnect);
beforeEach(clearAll);

describe('Authentication', () => {
  test('registers a user as Staff (role cannot be self-assigned) and never returns the password', async () => {
    const res = await api().post('/api/auth/register', { name: 'Alice', email: 'alice@test.local', password: 'Secret123', role: 'Admin' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('Staff');
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.token).toBeTruthy();
  });

  test('rejects duplicate email and weak passwords', async () => {
    await api().post('/api/auth/register', { name: 'Alice', email: 'alice@test.local', password: 'Secret123' });
    const dup = await api().post('/api/auth/register', { name: 'Alice 2', email: 'alice@test.local', password: 'Secret123' });
    expect(dup.status).toBe(409);
    const weak = await api().post('/api/auth/register', { name: 'Bob', email: 'bob@test.local', password: 'short' });
    expect(weak.status).toBe(400);
  });

  test('stores a bcrypt hash, logs in and rejects bad credentials with one generic message', async () => {
    await api().post('/api/auth/register', { name: 'Alice', email: 'alice@test.local', password: 'Secret123' });
    const { User } = require('../src/models');
    const raw = await User.findOne({ email: 'alice@test.local' }).select('+password');
    expect(raw.password).not.toBe('Secret123');
    expect(raw.password).toMatch(/^\$2[aby]\$/);

    const ok = await api().post('/api/auth/login', { email: 'alice@test.local', password: 'Secret123' });
    expect(ok.status).toBe(200);
    const badPw = await api().post('/api/auth/login', { email: 'alice@test.local', password: 'Wrong1234' });
    const noUser = await api().post('/api/auth/login', { email: 'nobody@test.local', password: 'Wrong1234' });
    expect(badPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(badPw.body.message).toBe(noUser.body.message);
  });

  test('protects routes: missing / invalid token -> 401', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
    expect((await api('garbage').get('/api/auth/me')).status).toBe(401);
    const { token } = await makeUser('Staff');
    const me = await api(token).get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.password).toBeUndefined();
  });

  test('deactivated users cannot log in or use existing tokens', async () => {
    const { user, token } = await makeUser('Staff');
    user.status = 'Inactive';
    await user.save();
    expect((await api(token).get('/api/auth/me')).status).toBe(403);
    expect((await api().post('/api/auth/login', { email: user.email, password: 'Password123' })).status).toBe(403);
  });

  test('updates profile and changes password', async () => {
    const { user, token } = await makeUser('Staff');
    const prof = await api(token).put('/api/auth/profile', { name: 'New Name' });
    expect(prof.body.data.name).toBe('New Name');

    const wrong = await api(token).put('/api/auth/change-password', { currentPassword: 'nope12345', newPassword: 'Another123' });
    expect(wrong.status).toBe(400);
    const ok = await api(token).put('/api/auth/change-password', { currentPassword: 'Password123', newPassword: 'Another123' });
    expect(ok.status).toBe(200);
    expect((await api().post('/api/auth/login', { email: user.email, password: 'Password123' })).status).toBe(401);
    expect((await api().post('/api/auth/login', { email: user.email, password: 'Another123' })).status).toBe(200);
  });
});

describe('Authorization (backend RBAC)', () => {
  test('role matrix is enforced by the API', async () => {
    const staff = await makeUser('Staff');
    const manager = await makeUser('Inventory Manager');
    const admin = await makeUser('Admin');
    const product = { productName: 'Test Product', SKU: 'X1', category: 'General', costPrice: 1, sellingPrice: 2 };

    expect((await api(staff.token).get('/api/users')).status).toBe(403);
    expect((await api(manager.token).get('/api/users')).status).toBe(403);
    expect((await api(admin.token).get('/api/users')).status).toBe(200);

    expect((await api(staff.token).post('/api/products', product)).status).toBe(403);
    expect((await api(staff.token).get('/api/products')).status).toBe(200);
    expect((await api(manager.token).post('/api/products', product)).status).toBe(201);

    expect((await api(staff.token).get('/api/stock-movements')).status).toBe(403);
    expect((await api(staff.token).get('/api/suppliers')).status).toBe(403);
    expect((await api(staff.token).get('/api/reports/valuation')).status).toBe(403);
    expect((await api(staff.token).get('/api/reports/dashboard')).status).toBe(200);
    expect((await api(staff.token).post('/api/inventory/adjustments', {})).status).toBe(403);
  });

  test('NoSQL operator injection in login is neutralised', async () => {
    await makeUser('Admin', { email: 'victim@test.local' });
    const res = await api().post('/api/auth/login', { email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });
});
