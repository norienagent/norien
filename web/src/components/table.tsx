import type { ReactNode } from 'react';

/**
 * The one table in the product.
 *
 * Markets, tokens, projects, registry, tools, transactions, and transfers all
 * render through this, so column alignment, header treatment, row hover, and
 * horizontal overflow behave the same everywhere and exist in one place.
 */

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Right-align numeric columns so digits line up down the column. */
  align?: 'left' | 'right';
  /** Hide below `sm` on narrow screens where the column is not essential. */
  hideBelow?: 'sm' | 'md' | 'lg';
  cell: (row: T) => ReactNode;
}

const hideClass: Record<string, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
};

export function Table<T>({
  rows,
  columns,
  rowKey,
  empty,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string;
  empty?: ReactNode;
}) {
  if (rows.length === 0) return <>{empty}</>;

  return (
    <div className="scroll-x">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-sunken">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={[
                  'whitespace-nowrap px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted',
                  column.align === 'right' ? 'text-right' : 'text-left',
                  column.hideBelow ? hideClass[column.hideBelow] : '',
                ].join(' ')}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              className="border-b border-line last:border-0 hover:bg-sunken/60"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={[
                    'whitespace-nowrap px-4 py-3 text-ink',
                    column.align === 'right' ? 'text-right' : 'text-left',
                    column.hideBelow ? hideClass[column.hideBelow] : '',
                  ].join(' ')}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
