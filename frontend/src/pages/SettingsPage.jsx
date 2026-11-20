import { useForm } from 'react-hook-form';
import { authApi } from '../api/index.js';
import { parseError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { THEMES, useTheme } from '../context/ThemeContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Field } from '../components/forms/Field.jsx';
import { Badge, DetailGrid, PageHeader, Spinner } from '../components/ui/index.jsx';
import { formatDateTime } from '../utils/format.js';

function ProfileForm() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting, isDirty } } = useForm({ defaultValues: { name: user.name, email: user.email } });

  const submit = handleSubmit(async (values) => {
    try {
      const res = await authApi.updateProfile(values);
      setUser((u) => ({ ...u, ...res.data }));
      toast.success('Profile updated');
    } catch (err) {
      const { message, fieldErrors } = parseError(err);
      fieldErrors.forEach((e) => e.field && setError(e.field, { message: e.message }));
      toast.error(message);
    }
  });

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-sm font-semibold">Profile</h2>
      <p className="mb-4 text-zinc-500">Your name and sign-in email.</p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Full name" required error={errors.name} htmlFor="name">
          <input id="name" className={`input ${errors.name ? 'input-error' : ''}`} {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Name is too short' } })} />
        </Field>
        <Field label="Email" required error={errors.email} htmlFor="email">
          <input id="email" type="email" className={`input ${errors.email ? 'input-error' : ''}`} {...register('email', { required: 'Email is required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' } })} />
        </Field>
        <button className="btn-primary" disabled={isSubmitting || !isDirty}>{isSubmitting && <Spinner />} Save profile</button>
      </form>
    </section>
  );
}

function PasswordForm() {
  const toast = useToast();
  const { register, handleSubmit, watch, reset, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });

  const submit = handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      toast.success('Password changed');
      reset();
    } catch (err) {
      const { message, fieldErrors } = parseError(err);
      fieldErrors.forEach((e) => e.field && setError(e.field, { message: e.message }));
      toast.error(message);
    }
  });

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-sm font-semibold">Change password</h2>
      <p className="mb-4 text-zinc-500">Use at least 8 characters with a letter and a number.</p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Current password" required error={errors.currentPassword} htmlFor="currentPassword">
          <input id="currentPassword" type="password" autoComplete="current-password" className={`input ${errors.currentPassword ? 'input-error' : ''}`} {...register('currentPassword', { required: 'Current password is required' })} />
        </Field>
        <Field label="New password" required error={errors.newPassword} htmlFor="newPassword">
          <input id="newPassword" type="password" autoComplete="new-password" className={`input ${errors.newPassword ? 'input-error' : ''}`} {...register('newPassword', { required: 'New password is required', minLength: { value: 8, message: 'At least 8 characters' }, validate: (v) => (/[A-Za-z]/.test(v) && /\d/.test(v)) || 'Include a letter and a number' })} />
        </Field>
        <Field label="Confirm new password" required error={errors.confirm} htmlFor="confirm">
          <input id="confirm" type="password" autoComplete="new-password" className={`input ${errors.confirm ? 'input-error' : ''}`} {...register('confirm', { required: 'Please confirm the new password', validate: (v) => v === watch('newPassword') || 'Passwords do not match' })} />
        </Field>
        <button className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner />} Update password</button>
      </form>
    </section>
  );
}

function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  return (
    <section className="card p-5 lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold">Appearance</h2>
      <p className="mb-4 text-zinc-500">Choose a theme. It is saved on this device. Press [ to hide or show the sidebar.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
        {Object.entries(THEMES).map(([key, t]) => (
          <button key={key} role="radio" aria-checked={theme === key} onClick={() => setTheme(key)}
            className={`rounded-md border p-3 text-left transition-colors ${theme === key ? 'border-zinc-900 ring-1 ring-zinc-900' : 'border-zinc-200 hover:border-zinc-400'}`}>
            <div className="mb-3 flex h-14 overflow-hidden rounded border border-black/10" style={{ background: t.swatch[0] }}>
              <div className="w-1/4" style={{ background: t.swatch[3] }} />
              <div className="flex flex-1 flex-col gap-1.5 p-2">
                <div className="h-2 w-2/3 rounded-sm" style={{ background: t.swatch[1] }} />
                <div className="h-2 w-1/2 rounded-sm" style={{ background: t.swatch[2] }} />
                <div className="h-2 w-5/6 rounded-sm" style={{ background: t.swatch[1] }} />
              </div>
            </div>
            <p className="font-medium text-zinc-900">{t.label}</p>
            <p className="text-xs text-zinc-500">{t.hint}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="Settings" description="Manage your account." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AppearanceCard />
        <ProfileForm />
        <PasswordForm />
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold">Account</h2>
          <DetailGrid
            items={[
              ['Role', <Badge tone="blue">{user.role}</Badge>],
              ['Status', user.status],
              ['Assigned warehouse', user.assignedWarehouse?.warehouseName],
              ['Member since', formatDateTime(user.createdAt)],
            ]}
          />
        </section>
      </div>
    </>
  );
}
