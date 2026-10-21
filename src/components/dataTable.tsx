import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  createPaginatedRowModel,
  createSortedRowModel,
  flexRender,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
  type ColumnDef,
  type PaginationState,
  type RowData,
  type SortingState,
} from '@tanstack/react-table'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * AdensaOps data table (TanStack Table v9).
 *
 * A single headless-powered table that reproduces the exact chrome the
 * hand-rolled table.tsx provided (sortable headers with aria-sort, 10-row
 * pager, sticky header) while unlocking multi-sort, filtering and column
 * visibility for the upcoming inventory and purchase-order surfaces.
 *
 * v9 is the current major and registers features explicitly; this table
 * enables only sorting + pagination so the bundle stays small. Styling is
 * the existing console markup, so the rendered DOM matches the old table —
 * the swap is behaviour-compatible by construction.
 *
 * Reusable: any page can define ColumnDef<Row> columns and drop them in.
 * The Suppliers and Customers pages both migrate to this.
 */

/**
 * Registers only core + sorting + pagination, so the bundle stays small.
 * Row models are wired via the sortedRowModel / paginatedRowModel slots; the
 * alphanumeric sort fn backs string columns. Defined at module scope so the
 * feature map is a stable type the columns can be typed against.
 */
const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
})

/** Features map this table is built on — first generic of TanStack's ColumnDef. */
export type DataTableFeatures = typeof features
/** A column definition for a DataTable, typed to this table's feature set. */
export type DataTableColumn<T extends RowData> = ColumnDef<DataTableFeatures, T>

export const PAGE_SIZE = 10

/** Prev/next pager with a summary line; hidden when everything fits. */
export function Pager({
  page,
  pageCount,
  total,
  onPage,
  noun,
}: {
  page: number
  pageCount: number
  total: number
  onPage: (page: number) => void
  noun: string
}) {
  if (pageCount <= 1) return null
  const from = page * PAGE_SIZE + 1
  const to = Math.min(total, (page + 1) * PAGE_SIZE)
  const clamp = (n: number) => Math.max(0, Math.min(pageCount - 1, n))
  return (
    <nav
      className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-ink-faint"
      aria-label={`${noun} pages`}
    >
      <span>
        {from} to {to} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPage(clamp(page - 1))}
          disabled={page === 0}
          aria-label="Previous page"
          className="cursor-pointer rounded-md border border-line-strong p-1.5 transition enabled:hover:bg-subtle disabled:cursor-default disabled:opacity-40"
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <span className="tabular-nums">
          {page + 1} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPage(clamp(page + 1))}
          disabled={page >= pageCount - 1}
          aria-label="Next page"
          className="cursor-pointer rounded-md border border-line-strong p-1.5 transition enabled:hover:bg-subtle disabled:cursor-default disabled:opacity-40"
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}

export interface DataTableProps<T extends object> {
  columns: DataTableColumn<T>[]
  data: T[]
  /** Unique key per row. */
  getRowId: (row: T) => string
  /** Renders one body cell for the given column id. */
  renderCell: (row: T, columnId: string) => ReactNode
  /** Aria label + pager noun, e.g. "Suppliers". */
  noun: string
  /** Message shown in a full-width row when there are no results. */
  emptyMessage: ReactNode
  /** Extra classes for the scroll container (e.g. max height). */
  containerClassName?: string
  /** Table element classes (min-width etc). */
  tableClassName?: string
  /** Called with the rows on the current page (after sort + paginate). */
  onVisibleRows?: (rows: T[]) => void
}

export function DataTable<T extends object>({
  columns,
  data,
  getRowId,
  renderCell,
  noun,
  emptyMessage,
  containerClassName = 'overflow-x-auto',
  tableClassName = '',
  onVisibleRows,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [pageIndex, setPageIndex] = useState(0)

  const table = useTable({
    features,
    columns,
    data,
    state: { sorting, pagination: { pageIndex, pageSize: PAGE_SIZE } },
    onSortingChange: setSorting,
    onPaginationChange: (updater: PaginationState | ((old: PaginationState) => PaginationState)) => {
      const next = typeof updater === 'function' ? updater({ pageIndex, pageSize: PAGE_SIZE }) : updater
      setPageIndex(next.pageIndex)
    },
    getRowId,
    // Single-column sort only: clicking a header cycles asc -> desc -> clear,
    // matching the previous table's behaviour exactly. (Row models are
    // registered on the feature slots above, not via get*RowModel options.)
    enableMultiSort: false,
    enableSortingRemoval: true,
  })

  // Keep the pager anchored to the first page whenever the result set
  // changes size (filter or search narrowed it), as the old table did.
  useEffect(() => {
    setPageIndex(0)
  }, [data.length])

  const { rows } = table.getRowModel()
  const columnCount = columns.length

  // Hand the current-page rows back to the page so sibling surfaces (mini
  // stats, map) can reflect exactly what the table shows, matching the old
  // behaviour where those derived from the paginated slice.
  //
  // Deliberately no effect deps: `rows` is a fresh array every render and
  // `onVisibleRows` is typically an inline setState, so a normal dep array
  // would re-fire forever (setState -> new rows -> effect -> setState). A ref
  // to the last slice lets us fire only when the current-page data actually
  // changes, without feeding the parent state back into our own render.
  const lastVisibleRef = useRef<T[] | null>(null)
  useEffect(() => {
    if (!onVisibleRows) return
    const current = rows.map((r) => r.original)
    const prev = lastVisibleRef.current
    const same =
      prev !== null &&
      prev.length === current.length &&
      prev.every((row, i) => row === current[i])
    if (same) return
    lastVisibleRef.current = current
    onVisibleRows(current)
  })

  return (
    <div
      className={`overflow-x-auto rounded-xl border border-line bg-surface shadow-sm ${containerClassName}`}
    >
      <table className={`w-full text-left text-sm ${tableClassName}`}>
        <thead className="sticky top-0 z-10 border-b border-line bg-subtle text-xs uppercase tracking-wide text-ink-faint">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort()
                const sorted = header.column.getIsSorted()
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className="px-4 py-3 text-left"
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={`inline-flex cursor-pointer items-center gap-1 uppercase tracking-wide transition hover:text-ink ${
                          sorted ? 'text-ink' : ''
                        }`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <ChevronDown
                          size={12}
                          aria-hidden="true"
                          className={`transition ${sorted ? 'opacity-100' : 'opacity-30'} ${
                            sorted === 'asc' ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.id} className="transition hover:bg-subtle">
              {row.getAllCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3">
                  {renderCell(row.original, cell.column.id)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columnCount} className="px-4 py-10 text-center text-ink-faint">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <Pager
        page={pageIndex}
        pageCount={table.getPageCount()}
        total={table.getPrePaginatedRowModel().rows.length}
        onPage={table.setPageIndex}
        noun={noun}
      />
    </div>
  )
}
