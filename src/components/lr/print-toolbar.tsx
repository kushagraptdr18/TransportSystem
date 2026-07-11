"use client";

export function PrintToolbar({ note }: { note?: string }) {
  return (
    <div className="no-print flex items-center gap-3 border-b bg-gray-100 px-4 py-2 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded bg-black px-4 py-1.5 text-sm font-medium text-white"
      >
        Print
      </button>
      {note && <span className="text-sm text-gray-600">{note}</span>}
    </div>
  );
}
