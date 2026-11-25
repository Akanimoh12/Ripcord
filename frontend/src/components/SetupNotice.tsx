import { isConfigured } from "@/lib/config";

export function SetupNotice() {
  if (isConfigured) return null;
  return (
    <div className="notice">
      <strong>Contracts not configured.</strong>{" "}
      <span className="muted">
        Deploy with <code>forge script script/Deploy.s.sol</code> and paste the printed addresses into{" "}
        <code>frontend/.env.local</code>.
      </span>
    </div>
  );
}
