/* ============================================================
   api.js — shared backend API wrapper (auth-aware fetch layer)
   Load this BEFORE shell.js and any page script that needs data.

   *** CONFIG: adjust this to match your actual backend origin/port ***
   ============================================================ */
(function () {
  "use strict";

  const API_BASE = "https://wsdp-backend.onrender.com/api/v1"; // <-- confirm/adjust this

  let accessToken = null;
  let currentUser = null; // { id, name, email, role, permissions }
  let refreshPromise = null;

  /**
   * Core request function. Every call sends credentials: 'include' so
   * the httpOnly refresh cookie travels automatically. On a
   * TOKEN_EXPIRED response, it transparently refreshes once and
   * retries — callers never see the expiry, only a final success or
   * a final failure.
   */
  async function request(method, path, body, opts) {
    opts = opts || {};
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});

    if (!accessToken) {
      accessToken = sessionStorage.getItem("wsdp_access_token");
    }

    if (accessToken && !opts.skipAuth) {
      headers["Authorization"] = "Bearer " + accessToken;
    }

    const res = await fetch(API_BASE + path, {
      method,
      headers,
      credentials: "include",
      body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
    });

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      // No JSON body (e.g. 204 No Content) — fine, data stays null.
    }

    if (
      res.status === 401 &&
      data?.error?.code === "TOKEN_EXPIRED" &&
      !opts._retried &&
      !opts.skipRefreshRetry
    ) {
      const refreshed = await refreshSession();

      if (refreshed) {
        return request(
          method,
          path,
          body,
          Object.assign({}, opts, { _retried: true })
        );
      }
    }

    if (!res.ok) {
      console.error("API ERROR RESPONSE:", data);

      const err = new Error(
        (data && data.error && data.error.message) || "Request failed"
      );

      err.status = res.status;
      err.code = data && data.error && data.error.code;
      err.details = data && data.error && data.error.details;

      throw err;
    }

    return data;
  }

  /** POST /auth/login — stores the access token in memory, returns the user. */
  async function login(email, password) {
    const result = await request("POST", "/auth/login", { email, password }, { skipAuth: true });

    accessToken = result.data.access_token;
    currentUser = result.data.user;

    sessionStorage.setItem(
      "wsdp_access_token",
      accessToken
    );

    sessionStorage.setItem(
      "wsdp_user",
      JSON.stringify(currentUser)
    );

    return currentUser;
  }

  /**
   * POST /auth/refresh — uses the httpOnly cookie to silently obtain a
   * new access token. This is what makes the session survive a full
   * page reload/navigation in this multi-page app. Returns true/false
   * instead of throwing, since a failed refresh is an expected,
   * routine outcome (no session yet, or truly logged out) — not an error.
   */
  async function refreshSession() {
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async function () {
      try {
        const result = await request("POST", "/auth/refresh", null, {
          skipAuth: true,
          skipRefreshRetry: true,
        });

        accessToken = result.data.access_token;

        sessionStorage.setItem(
          "wsdp_access_token",
          accessToken
        );

        if (result.data.user) {
          currentUser = result.data.user;
          sessionStorage.setItem("wsdp_user", JSON.stringify(currentUser));
        }

        return true;
      } catch (e) {
        accessToken = null;
        currentUser = null;
        sessionStorage.removeItem("wsdp_user");
        return false;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  /** POST /auth/logout — revokes the session server-side and clears local state. */
  async function logout() {
    try {
      await request("POST", "/auth/logout");
    } catch (e) {
      // Even if the call fails (e.g. already logged out elsewhere), we
      // still want to clear local state and let the caller redirect.
    }
    accessToken = null;
    currentUser = null;
    sessionStorage.removeItem("wsdp_user");
    sessionStorage.removeItem("wsdp_access_token");
  }

  /** GET /auth/me — refreshes the cached currentUser from the server. */
  async function fetchMe() {
    const result = await request("GET", "/auth/me");
    currentUser = result.data;
    return currentUser;
  }

  function getAccessToken() {
    if (!accessToken) {
      accessToken = sessionStorage.getItem("wsdp_access_token");
    }

    return accessToken;
  }

  function getCurrentUser() {
    if (!accessToken) {
      accessToken = sessionStorage.getItem("wsdp_access_token");
    }

    if (currentUser) {
      return currentUser;
    }

    try {
      const stored = sessionStorage.getItem("wsdp_user");
      currentUser = stored ? JSON.parse(stored) : null;
    } catch (e) {
      currentUser = null;
    }

    return currentUser;
  }

  /**
   * Call once per page load (except on the login page itself) to
   * silently restore a session from the refresh cookie. Returns the
   * user object on success, or null if there's no valid session —
   * callers decide what to do with null (usually: redirect to login).
   */
  async function restoreSession() {
    let user = getCurrentUser();

    if (user && accessToken) {
      return user;
    }

    try {
      const ok = await refreshSession();

      if (!ok) {
        return null;
      }

      return await fetchMe();
    } catch (e) {
      return null;
    }
  }

  window.WSDP_API = {
    request,
    login,
    logout,
    restoreSession,
    getAccessToken,
    getCurrentUser,
  };
})();
