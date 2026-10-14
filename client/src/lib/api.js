// Single place every request to the LuxuryStay API goes through.

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/+$/, "");

const TOKEN_KEY = "token";
const USER_KEY = "user";

export class ApiError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors || [];
  }

  // Field-level messages keyed by field name, for forms.
  get fields() {
    const map = {};
    for (const item of this.errors) {
      if (item.field && !map[item.field]) map[item.field] = item.message;
    }
    return map;
  }
}

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const session = {
  getToken: () => read(TOKEN_KEY),

  getUser() {
    try {
      return JSON.parse(read(USER_KEY) || "null");
    } catch {
      return null;
    }
  },

  save(token, user) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      // Storage can be unavailable (private mode); the session then lasts
      // only until the page is reloaded.
    }
  },

  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // Nothing to clear.
    }
  },
};

const buildUrl = (path, query) => {
  const url = `${API_URL}${path}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }

  const text = params.toString();
  return text ? `${url}?${text}` : url;
};

const send = async (method, path, { body, form, query, signal } = {}) => {
  const token = session.getToken();

  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError(
      "Unable to reach the server. Check your connection and try again.",
      0
    );
  }

  // A rejected token means the session ended (expired, signed out elsewhere,
  // password changed). Everyone listening is told to return to sign-in.
  if (response.status === 401 && token) {
    session.clear();
    window.dispatchEvent(new CustomEvent("ls:session-expired"));
  }

  return response;
};

const request = async (method, path, options) => {
  const response = await send(method, path, options);

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new ApiError(
      data?.message || "Something went wrong. Please try again.",
      response.status,
      data?.errors
    );
  }

  return data;
};

export const api = {
  get: (path, query, options) => request("GET", path, { ...options, query }),
  post: (path, body, options) => request("POST", path, { ...options, body: body ?? {} }),
  put: (path, body, options) => request("PUT", path, { ...options, body: body ?? {} }),
  patch: (path, body, options) => request("PATCH", path, { ...options, body: body ?? {} }),
  delete: (path, options) => request("DELETE", path, options),
  upload: (path, form, options) => request("POST", path, { ...options, form }),

  // Protected files (identity documents) are fetched with the session token
  // and handed back as a temporary object URL.
  async file(path) {
    const response = await send("GET", path);

    if (!response.ok) {
      let message = "This file could not be opened.";
      try {
        message = (await response.json()).message || message;
      } catch {
        // Keep the default message.
      }
      throw new ApiError(message, response.status);
    }

    const blob = await response.blob();
    return { url: URL.createObjectURL(blob), type: blob.type };
  },
};
