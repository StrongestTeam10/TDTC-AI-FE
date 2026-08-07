import type { ReactNode } from 'react';

// 2026-08-07 신규: 개인정보처리방침/이용약관 두 문서가 함께 쓰는 표시 요소.
// 조문 번호와 표 스타일을 한 곳에 모아둬야 두 문서의 모양이 갈라지지 않는다.

/** 조(條) 단위 묶음. id는 목차에서 앵커로 잡는다. */
export function Article({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
      <section id={id} className="scroll-mt-4 space-y-2">
        <h3 className="border-l-4 border-blue-600 pl-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h3>
        <div className="space-y-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {children}
        </div>
      </section>
  );
}

const CIRCLED_NUMBERS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

/**
 * ① ② ③ … 번호가 붙는 항 목록.
 *
 * 조문 중간에 표가 끼어 목록이 두 덩어리로 갈리는 경우(예: 위탁 조항)가 있는데,
 * 그때 뒷덩어리가 다시 ①부터 시작하면 안 되므로 start로 이어붙인다.
 */
export function ClauseList({ items, start = 1 }: { items: ReactNode[]; start?: number }) {
  return (
      <ol className="space-y-1.5">
        {items.map((item, index) => {
            const clauseNumber = start + index;
            return (
                <li key={index} className="flex gap-2">
                  <span className="shrink-0 text-slate-400 dark:text-slate-600">
                    {CIRCLED_NUMBERS[clauseNumber - 1] ?? `(${clauseNumber})`}
                  </span>
                  <span>{item}</span>
                </li>
            );
        })}
      </ol>
  );
}

/** 1. 2. 3. … 번호가 붙는 호 목록. */
export function NumberedList({ items }: { items: ReactNode[] }) {
  return (
      <ol className="ml-1 list-inside list-decimal space-y-1">
        {items.map((item, index) => (
            <li key={index}>{item}</li>
        ))}
      </ol>
  );
}

/**
 * 문서 안의 표. 좁은 화면에서 표가 페이지 전체를 옆으로 늘리지 않도록
 * 가로 스크롤을 표 자신이 갖는다.
 */
export function DocTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
      <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[32rem] border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800">
              {headers.map((header) => (
                  <th
                      key={header}
                      className="border-b border-slate-200 dark:border-slate-700 px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300"
                  >
                    {header}
                  </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                  {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="px-3 py-2 align-top text-slate-600 dark:text-slate-400">
                        {cell}
                      </td>
                  ))}
                </tr>
            ))}
          </tbody>
        </table>
      </div>
  );
}

/** 표 아래 붙는 ※ 단서. */
export function TableNote({ children }: { children: ReactNode }) {
  return <p className="text-xs text-slate-500 dark:text-slate-500">{children}</p>;
}
