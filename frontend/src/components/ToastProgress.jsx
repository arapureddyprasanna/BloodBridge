import { useEffect, useState } from "react";
import "./ToastProgress.css";

function ToastProgress({ duration = 3500, type = "success" }) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const startedAt = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);

      setProgress(remaining);

      if (remaining <= 0) clearInterval(interval);
    }, 40);

    return () => clearInterval(interval);
  }, [duration]);

  return (
    <div className="toast-progress-track">
      <div
        className={`toast-progress-fill toast-progress-${type}`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export default ToastProgress;