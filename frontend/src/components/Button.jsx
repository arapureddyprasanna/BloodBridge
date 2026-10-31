import "./Button.css";

function Button({
  children,
  variant = "primary",
  type = "button",
  onClick,
  disabled = false,
  fullWidth = false,
  className = "",
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`bb-button bb-button-${variant} ${
        fullWidth ? "bb-button-full" : ""
      } ${className}`}
    >
      {children}
    </button>
  );
}

export default Button;