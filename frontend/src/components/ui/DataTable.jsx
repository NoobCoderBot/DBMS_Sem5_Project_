import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { EmptyState, ErrorState, Pagination } from './index.jsx';

/** Shimmering placeholder rows shown while a page of data loads. */
function SkeletonRows({ cols, rows = 6 }) {
  return (
    <div className="divide-y divide-zinc-100" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-6 px-4 py-3.5">
          {Array.from({ length: Math.min(cols, 6) }, (_, c) => (
            <div key={c} className="skeleton h-3.5" style={{ width: `${c === 0 ? 22 : 10 + ((r * 7 + c * 11) % 10)}%`, animationDelay: `${(r + c) * 60}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * columns: [{ key, label, render?(row), sortKey?, align?, className? }]
 * Server-side sorting/pagination: parent owns `sort` ({ sortBy, order }) and receives changes.
 */
export default function DataTable({ columns, rows, loading, error, onRetry, sort, onSort, pagination, onPage, onRowClick, empty, rowKey = (r) => r._id }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              {columns.map((c) => {
                const sortable = c.sortKey && onSort;
                const active = sortable && sort?.sortBy === c.sortKey;
                const Icon = !active ? ChevronsUpDown : sort.order === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <th key={c.key} className={`th ${c.align === 'right' ? 'text-right' : ''} ${c.className || ''}`} aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {sortable ? (
                      <button className="inline-flex items-center gap-1 hover:text-zinc-900" onClick={() => onSort(c.sortKey)}>
                        {c.label}
                        <Icon className={`h-3 w-3 ${active ? 'text-brand-700' : 'text-zinc-300'}`} />
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          {!loading && !error && rows.length > 0 && (
            <tbody>
              {rows.map((row, idx) => (
                <tr key={rowKey(row)} style={{ animationDelay: `${Math.min(idx, 12) * 28}ms` }} className={`animate-rise transition-colors hover:bg-zinc-50 ${onRowClick ? 'cursor-pointer' : ''}`} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                  {columns.map((c) => (
                    <td key={c.key} className={`td ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.className || ''}`}>
                      {c.render ? c.render(row) : row[c.key] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
      {loading && <SkeletonRows cols={columns.length} />}
      {!loading && error && <ErrorState message={error} onRetry={onRetry} />}
      {!loading && !error && rows.length === 0 && (empty || <EmptyState hint="Try adjusting your search or filters." />)}
      {!loading && !error && <Pagination pagination={pagination} onPage={onPage} />}
    </div>
  );
}
