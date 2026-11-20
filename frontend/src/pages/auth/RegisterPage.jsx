import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Spinner } from '../../components/ui/index.jsx';
import { Field } from '../../components/forms/Field.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { parseError } from '../../api/client.js';
import AuthShell from './AuthShell.jsx';

export default function RegisterPage() {
  const { register: signUp } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: { name: '', email: '', password: '', confirm: '' } });

  const onSubmit = async ({ name, email, password }) => {
    setServerError('');
    try {
      await signUp({ name, email, password });
      navigate('/', { replace: true });
    } catch (err) {
      const { message, fieldErrors } = parseError(err);
      fieldErrors.forEach((e) => e.field && setError(e.field, { message: e.message }));
      setServerError(message);
    }
  };

  return (
    <AuthShell
      title="Create account"
      subtitle="New accounts start with Staff access. An administrator can grant more."
      footer={<>Already registered? <Link className="font-medium text-brand-700 hover:underline" to="/login">Sign in</Link></>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {serverError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{serverError}</div>}
        <Field label="Full name" required error={errors.name} htmlFor="name">
          <input id="name" className={`input ${errors.name ? 'input-error' : ''}`} {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Name is too short' } })} />
        </Field>
        <Field label="Email" required error={errors.email} htmlFor="email">
          <input id="email" type="email" className={`input ${errors.email ? 'input-error' : ''}`} {...register('email', { required: 'Email is required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' } })} />
        </Field>
        <Field label="Password" required error={errors.password} htmlFor="password" hint="At least 8 characters, with a letter and a number.">
          <input id="password" type="password" autoComplete="new-password" className={`input ${errors.password ? 'input-error' : ''}`} {...register('password', { required: 'Password is required', minLength: { value: 8, message: 'At least 8 characters' }, validate: (v) => (/[A-Za-z]/.test(v) && /\d/.test(v)) || 'Include a letter and a number' })} />
        </Field>
        <Field label="Confirm password" required error={errors.confirm} htmlFor="confirm">
          <input id="confirm" type="password" autoComplete="new-password" className={`input ${errors.confirm ? 'input-error' : ''}`} {...register('confirm', { required: 'Please confirm your password', validate: (v) => v === watch('password') || 'Passwords do not match' })} />
        </Field>
        <button className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting && <Spinner />} Create account
        </button>
      </form>
    </AuthShell>
  );
}
