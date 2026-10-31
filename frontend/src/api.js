const configuredApiBase = (
  process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  "http://127.0.0.1:8000/api"
).replace(/\/+$/, "");

export const API_BASE_URL = /\/api$/i.test(configuredApiBase)
  ? configuredApiBase
  : `${configuredApiBase}/api`;
