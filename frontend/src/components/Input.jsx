import "./Input.css";

function Input({
  label,
  name,
  type = "text",
  placeholder = "",
  value = "",
  onChange,
  error = "",
  required = false,
  disabled = false,
  fullWidth = true,
  className = "",
}) {
  return (
    <div
      className={`bb-input-group ${
        fullWidth ? "bb-input-full" : ""
      } ${className}`}
    >
      {label && (
        <label htmlFor={name} className="bb-input-label">
          {label}
          {required && <span className="bb-input-required"> *</span>}
        </label>
      )}

      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`bb-input ${error ? "bb-input-error" : ""}`}
      />

      {error && <p className="bb-input-error-text">{error}</p>}
    </div>
  );
}

export default Input;