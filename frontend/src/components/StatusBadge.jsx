import "./StatusBadge.css";

function StatusBadge({
  status,
  variant = "default",
  className = "",
}) {
  return (
    <span className={`bb-status-badge bb-status-${variant} ${className}`}>
      {status}
    </span>
  );
}

export default StatusBadge;