import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Pencil, Trash2, RotateCcw } from 'lucide-react';
import { parseError } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { useList } from '../hooks/useList.js';
import DataTable from './ui/DataTable.jsx';
import { Modal, ConfirmDialog } from './ui/Modal.jsx';
import { FilterSelect, PageHeader, SearchInput, Spinner, DetailGrid } from './ui/index.jsx';
import { ConfigField } from './forms/Field.jsx';

function FormModal({ open, onClose, config, item, onSaved }) {
  const toast = useToast();
  const isEdit = Boolean(item);
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: {} });

  useEffect(() => {
    if (!open) return;
    const base = Object.fromEntries(config.fields.map((f) => [f.name, f.defaultValue ?? '']));
    if (item) {
      for (const f of config.fields) base[f.name] = f.fromItem ? f.fromItem(item) : item[f.name] ?? '';
      for (const f of config.fields) if (f.type === 'password') base[f.name] = '';
    }
    reset(base);
  }, [open, item, config.fields, reset]);

  const submit = handleSubmit(async (values) => {
    const payload = { ...values };
    for (const f of config.fields) {
      if (f.type === 'password' && isEdit && !payload[f.name]) delete payload[f.name];
      if (f.hideOnEdit && isEdit) delete payload[f.name];
      if (payload[f.name] === undefined || Number.isNaN(payload[f.name])) delete payload[f.name];
    }
    try {
      const saved = isEdit ? await config.api.update(item._id, payload) : await config.api.create(payload);
      toast.success(`${config.singular} ${isEdit ? 'updated' : 'created'} successfully`);
      onSaved(saved);
    } catch (err) {
      const { message, fieldErrors } = parseError(err);
      fieldErrors.forEach((e) => e.field && setError(e.field, { message: e.message }));
      toast.error(message);
    }
  });

  const fields = config.fields.filter((f) => !(isEdit && f.hideOnEdit));
  return (
    <Modal
      open={open}
      onClose={isSubmitting ? () => {} : onClose}
      title={`${isEdit ? 'Edit' : 'New'} ${config.singular}`}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {isEdit ? 'Save changes' : `Create ${config.singular.toLowerCase()}`}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        {fields.map((f) => (
          <ConfigField key={f.name} field={f} register={register} errors={errors} isEdit={isEdit} />
        ))}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

/**
 * Generic, API-backed CRUD page: server-side search / filters / sort / pagination, detail view,
 * create + edit form with validation, and delete confirmation.
 */
export default function ResourcePage({ config, permissions }) {
  const toast = useToast();
  const list = useList((p) => config.api.list(p), config.initialParams);
  const [formState, setFormState] = useState({ open: false, item: null });
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const openDetail = async (row) => {
    setDetail(row);
    setDetailLoading(true);
    try {
      setDetail(await config.api.get(row._id));
    } catch (err) {
      toast.error(parseError(err).message);
    } finally {
      setDetailLoading(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await config.api.remove(toDelete._id);
      toast.success(`${config.singular} deleted`);
      setToDelete(null);
      setDetail(null);
      list.refresh();
    } catch (err) {
      toast.error(parseError(err).message);
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const columns = useMemo(() => {
    const cols = [...config.columns];
    if (permissions.update || permissions.remove) {
      cols.push({
        key: '_actions',
        label: '',
        align: 'right',
        render: (row) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {permissions.update && (
              <button className="btn-ghost btn-sm" title="Edit" aria-label={`Edit ${row[config.nameKey]}`} onClick={() => setFormState({ open: true, item: row })}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {permissions.remove && (
              <button className="btn-ghost btn-sm text-zinc-400 hover:bg-red-50 hover:text-red-600" title="Delete" aria-label={`Delete ${row[config.nameKey]}`} onClick={() => setToDelete(row)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ),
      });
    }
    return cols;
  }, [config, permissions]);

  const hasFilters = Object.keys(list.params).some((k) => !['page', 'limit', 'sortBy', 'order'].includes(k) && list.params[k]);

  return (
    <>
      <PageHeader
        title={config.title}
        description={config.description}
        actions={
          permissions.create && (
            <button className="btn-primary" onClick={() => setFormState({ open: true, item: null })}>
              <Plus className="h-4 w-4" /> New {config.singular.toLowerCase()}
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput className="w-full sm:w-72" value={list.params.search} onChange={(v) => list.setParam('search', v)} placeholder={config.searchPlaceholder} />
        {(config.filters || []).map((f) => (
          <FilterSelect key={f.key} label={f.label} options={f.options} value={list.params[f.key]} onChange={(v) => list.setParam(f.key, v)} />
        ))}
        {hasFilters && (
          <button className="btn-ghost" onClick={list.reset}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        sort={list.sort}
        onSort={list.setSort}
        pagination={list.pagination}
        onPage={list.setPage}
        onRowClick={openDetail}
      />

      <FormModal
        open={formState.open}
        item={formState.item}
        config={config}
        onClose={() => setFormState({ open: false, item: null })}
        onSaved={() => {
          setFormState({ open: false, item: null });
          setDetail(null);
          list.refresh();
        }}
      />

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `${config.singular} details` : ''}
        size="lg"
        footer={
          detail && (
            <>
              {permissions.remove && (
                <button className="btn-secondary mr-auto text-red-600" onClick={() => setToDelete(detail)}>
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              )}
              <button className="btn-secondary" onClick={() => setDetail(null)}>Close</button>
              {permissions.update && (
                <button className="btn-primary" onClick={() => { setFormState({ open: true, item: detail }); setDetail(null); }}>
                  <Pencil className="h-4 w-4" /> Edit
                </button>
              )}
            </>
          )
        }
      >
        {detail && (detailLoading ? <div className="flex justify-center py-8"><Spinner className="h-5 w-5" /></div> : (
          <div className="space-y-5">
            <DetailGrid items={config.detailItems(detail)} />
            {config.detailExtra?.(detail)}
          </div>
        ))}
      </Modal>

      <ConfirmDialog
        open={Boolean(toDelete)}
        danger
        loading={deleting}
        title={`Delete ${config.singular.toLowerCase()}?`}
        message={`"${toDelete?.[config.nameKey] || ''}" will be permanently deleted. Records that are referenced by orders or stock history cannot be deleted - deactivate them instead.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
