import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Spinner } from '../../components/ui/index.jsx';
import { Field } from '../../components/forms/Field.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { parseError } from '../../api/client.js';
import AuthShell from './AuthShell.jsx';

const DEMO = [
  { label: 'Admin', email: 'admin@stockflow.com', password: 'Admin@123' },
  { label: 'Manager', email: 'manager1@stockflow.com', password: 'Manager@123' },
  { label: 'Staff', email: 'staff1@stockflow.com', password: 'Staff@123' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState('');
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm({ defaultValues: { email: '', password: '' } });

  const onSubmit = async (values) => {
    setServerError('');
    try {
      await login(values);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setServerError(parseError(err).message);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access your inventory workspace"
      footer={<>New here? <Link className="font-medium text-brand-700 hover:underline" to="/register">Create an account</Link></>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {serverError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{serverError}</div>}
        <Field label="Email" error={errors.email} htmlFor="email">
          <input id="email" type="email" autoComplete="username" className={`input ${errors.email ? 'input-error' : ''}`} {...register('email', { required: 'Email is required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' } })} />
        </Field>
        <Field label="Password" error={errors.password} htmlFor="password">
          <input id="password" type="password" autoComplete="current-password" className={`input ${errors.password ? 'input-error' : ''}`} {...register('password', { required: 'Password is required' })} />
        </Field>
        <button className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting && <Spinner />} Sign in
        </button>
      </form>

      <div className="mt-5 border-t border-zinc-100 pt-4">
        <p className="mb-2 kicker">Demo accounts (seeded data)</p>
        <div className="flex gap-2">
          {DEMO.map((d) => (
            <button key={d.label} type="button" className="btn-secondary btn-sm flex-1" onClick={() => { setValue('email', d.email); setValue('password', d.password); }}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  );
}
