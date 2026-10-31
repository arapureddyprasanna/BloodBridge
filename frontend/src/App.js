import AppRoutes from "./AppRoutes";
import { Toaster, toast } from "react-hot-toast";
import ToastProgress from "./components/ToastProgress";

function App() {
  return (
    <>
      <AppRoutes />

      <Toaster
        position="top-right"
        reverseOrder={false}
        gutter={10}
        toastOptions={{
          duration: 3500,
          style: {
            position: "relative",
            overflow: "hidden",
            background: "#ffffff",
            color: "#34272b",
            border: "1px solid #eadde0",
            borderRadius: "12px",
            padding: "14px 16px",
            fontSize: "14px",
            boxShadow: "0 8px 28px rgba(80, 20, 30, 0.10)",
          },
        }}
      />
    </>
  );
}

export function showToast(message, type = "success") {
  toast.custom(
    (toastItem) => (
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          width: "320px",
          maxWidth: "calc(100vw - 40px)",
          padding: "18px 16px 14px",
          background: "#ffffff",
          color: "#34272b",
          border: "1px solid #eadde0",
          borderRadius: "12px",
          boxShadow: "0 8px 28px rgba(80, 20, 30, 0.10)",
          opacity: toastItem.visible ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
      >
        <ToastProgress duration={3500} type={type} />

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              color: type === "error" ? "#b42332" : "#218653",
              fontSize: "18px",
            }}
          >
            {type === "error" ? "✕" : "✓"}
          </span>
          <span style={{ fontSize: "14px", lineHeight: 1.5 }}>
            {message}
          </span>
        </div>
      </div>
    ),
    { duration: 3500 }
  );
}

export default App;