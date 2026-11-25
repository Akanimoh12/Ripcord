import { explorerTx } from "@/lib/config";

export function TxStatus({ status, message, hash }: { status: string; message?: string; hash?: string }) {
  if (status === "idle" || !message) return null;
  const link = hash && status !== "signing" ? explorerTx(hash) : undefined;
  return (
    <p className={`status ${status === "error" ? "status-error" : "muted"}`} role="status">
      {message}
      {link && (
        <>
          {" · "}
          <a href={link} target="_blank" rel="noreferrer">
            view tx
          </a>
        </>
      )}
    </p>
  );
}
