import { useEffect, useState } from 'react';

/** Label + control + error wrapper. */
export function Field({ label, error, required, hint, children, className = '', htmlFor }) {
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="mt-1 text-xs text-red-600" role="alert">{error.message || error}</p> : hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

/** Loads select options from `field.options` (static) or `field.loadOptions()` (async). */
function useOptions(field) {
  const [options, setOptions] = useState(field.options || []);
  useEffect(() => {
    if (!field.loadOptions) return undefined;
    let cancelled = false;
    field.loadOptions().then((opts) => !cancelled && setOptions(opts)).catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return options;
}

/** Config-driven field for react-hook-form. */
export function ConfigField({ field, register, errors, isEdit }) {
  const options = useOptions(field);
  const error = errors[field.name];
  const required = field.required && !(isEdit && field.optionalOnEdit);
  const id = `f-${field.name}`;

  const rules = {
    ...(required && { required: `${field.label} is required` }),
    ...(field.minLength && { minLength: { value: field.minLength, message: `${field.label} must be at least ${field.minLength} characters` } }),
    ...(field.maxLength && { maxLength: { value: field.maxLength, message: `${field.label} must be at most ${field.maxLength} characters` } }),
    ...(field.min !== undefined && { min: { value: field.min, message: `${field.label} must be at least ${field.min}` } }),
    ...(field.pattern && { pattern: { value: field.pattern, message: field.patternMessage || `${field.label} is invalid` } }),
    ...(field.validate && { validate: field.validate }),
    ...(field.type === 'number' && { setValueAs: (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)) }),
  };
  const cls = `input ${error ? 'input-error' : ''}`;
  const common = { id, 'aria-invalid': Boolean(error), disabled: field.disabled?.(isEdit), ...register(field.name, rules) };

  let control;
  if (field.type === 'textarea') control = <textarea rows={3} className={cls} placeholder={field.placeholder} {...common} />;
  else if (field.type === 'select')
    control = (
      <select className={cls} {...common}>
        {!field.noEmpty && <option value="">{field.emptyLabel || 'Select...'}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  else
    control = (
      <input
        type={field.type || 'text'}
        step={field.type === 'number' ? field.step || 'any' : undefined}
        autoComplete={field.type === 'password' ? 'new-password' : 'off'}
        className={cls}
        placeholder={field.placeholder}
        {...common}
      />
    );

  return (
    <Field label={field.label} error={error} required={required} hint={isEdit && field.editHint ? field.editHint : field.hint} className={field.wide ? 'sm:col-span-2' : ''} htmlFor={id}>
      {control}
    </Field>
  );
}
