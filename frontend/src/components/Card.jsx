import "./Card.css";

function Card({
  children,
  title = "",
  subtitle = "",
  className = "",
}) {
  return (
    <div className={`bb-card ${className}`}>
      {(title || subtitle) && (
        <div className="bb-card-header">
          {title && <h3 className="bb-card-title">{title}</h3>}
          {subtitle && <p className="bb-card-subtitle">{subtitle}</p>}
        </div>
      )}

      <div className="bb-card-content">{children}</div>
    </div>
  );
}

export default Card;