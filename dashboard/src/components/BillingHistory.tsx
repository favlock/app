import { useState } from "react";
import { useBillingTransactions } from "../hooks/useBillingManagementQuery";
import { formatMoney, type BillingTransaction } from "../lib/billingManagementApi";
import { Button } from "./ui/button";

const STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  pending: "Pending",
  refunded: "Refunded",
  partialRefund: "Partially refunded",
  chargedBack: "Charged back",
  uncollectible: "Uncollectible",
  declined: "Declined",
  canceled: "Canceled",
  void: "Void",
};

function statusTone(status: string): string {
  if (status === "paid") return "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300";
  if (status === "pending") return "bg-amber-500/12 text-amber-800 dark:text-amber-200";
  if (["declined", "chargedBack", "uncollectible"].includes(status)) {
    return "bg-red-500/12 text-red-700 dark:text-red-300";
  }
  return "bg-[color-mix(in_oklab,var(--app-line)_12%,transparent)] liquid-muted";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function TransactionRow({ transaction }: { transaction: BillingTransaction }) {
  const charged = transaction.amountPaid ?? transaction.amount;
  return (
    <li className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium liquid-ink">
          {formatDate(transaction.createdAt)}
          {transaction.description ? (
            <span className="font-normal liquid-muted"> · {transaction.description}</span>
          ) : null}
        </p>
        {transaction.orderId ? (
          <p className="mt-0.5 truncate font-mono text-xs liquid-muted">
            Order {transaction.orderId}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone(transaction.status)}`}>
          {STATUS_LABELS[transaction.status] ?? transaction.status}
        </span>
        <span className="text-sm font-semibold tabular-nums liquid-ink">
          {formatMoney(charged, transaction.currency)}
        </span>
      </div>
    </li>
  );
}

export default function BillingHistory() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, isFetching } = useBillingTransactions(true, page);
  const totalPages = data?.totalPages ?? 0;

  return (
    <div className="mt-5 rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_16%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_55%,transparent)] p-5">
      <h4 className="text-sm font-semibold liquid-ink">Payment history</h4>
      {isLoading ? (
        <p className="mt-3 text-sm liquid-muted" role="status">Loading payments…</p>
      ) : isError ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-300" role="alert">
          Payment history could not be loaded. Please try again later.
        </p>
      ) : !data || data.items.length === 0 ? (
        <p className="mt-3 text-sm liquid-muted">No payments yet.</p>
      ) : (
        <ul
          className="mt-2 divide-y divide-[color-mix(in_oklab,var(--app-line)_12%,transparent)]"
          aria-busy={isFetching}
        >
          {data.items.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))}
        </ul>
      )}
      {totalPages > 1 ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <Button
            type="button"
            plain
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Newer
          </Button>
          <span className="text-xs liquid-muted">
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            plain
            disabled={page >= totalPages || isFetching}
            onClick={() => setPage((current) => current + 1)}
          >
            Older
          </Button>
        </div>
      ) : null}
      <p className="mt-3 text-xs liquid-muted">
        Official receipts and tax invoices are issued by Creem and sent to your
        billing email. You can also download them from Creem billing.
      </p>
    </div>
  );
}
