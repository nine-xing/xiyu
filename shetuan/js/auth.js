(function (global) {
  "use strict";

  var CSRF_KEY = "clubCsrfToken";
  var LOGIN_MARKER_KEY = "clubLoggedIn";
  var captchaState = {};

  function apiBase() {
    var c = global.ClubApiConfig;
    return (c && c.baseUrl) || "";
  }

  function getToken() {
    return sessionStorage.getItem(CSRF_KEY) || "";
  }

  function setToken(t) {
    if (t) {
      sessionStorage.setItem(CSRF_KEY, t);
      sessionStorage.setItem(LOGIN_MARKER_KEY, "1");
    } else {
      sessionStorage.removeItem(CSRF_KEY);
      sessionStorage.removeItem(LOGIN_MARKER_KEY);
    }
  }

  function fetchLoginChallenge() {
    var prefix = apiBase().replace(/\/$/, "");
    var url = (prefix ? prefix : "") + "/api/login-challenge";
    return fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    }).then(function (res) {
      return res.json().then(function (body) {
        var ch = body && body.challenge;
        if (
          !res.ok ||
          !ch ||
          typeof ch.id !== "string" ||
          ch.iat == null ||
          typeof ch.mac !== "string"
        ) {
          throw new Error(
            (body && body.error) || "无法获取登录凭证，请稍后重试"
          );
        }
        return ch;
      });
    });
  }

  function turnstileSiteKey() {
    var c = global.ClubApiConfig;
    var key = c && c.turnstileSiteKey ? String(c.turnstileSiteKey) : "";
    return key.trim();
  }

  function captchaEnabled() {
    return turnstileSiteKey() !== "";
  }

  function ensureCaptcha(formId, slotId) {
    if (!captchaEnabled()) return Promise.resolve(true);
    return new Promise(function (resolve, reject) {
      var slot = document.getElementById(slotId);
      if (!slot) {
        reject(new Error("验证码容器不存在"));
        return;
      }
      slot.style.display = "";
      function ready() {
        return (
          global.turnstile &&
          typeof global.turnstile.render === "function" &&
          typeof global.turnstile.getResponse === "function"
        );
      }
      var waitCount = 0;
      function mount() {
        if (!ready()) {
          waitCount += 1;
          if (waitCount > 80) {
            reject(new Error("验证码加载失败，请刷新页面重试"));
            return;
          }
          setTimeout(mount, 100);
          return;
        }
        if (captchaState[formId] && captchaState[formId].widgetId) {
          resolve(true);
          return;
        }
        var widgetId = global.turnstile.render("#" + slotId, {
          sitekey: turnstileSiteKey(),
          theme: "light",
          callback: function () {
            /* token by getResponse */
          },
          "expired-callback": function () {},
          "error-callback": function () {},
        });
        captchaState[formId] = { widgetId: widgetId };
        resolve(true);
      }
      mount();
    });
  }

  function captchaToken(formId) {
    if (!captchaEnabled()) return "";
    var st = captchaState[formId];
    if (!st || st.widgetId == null || !global.turnstile) return "";
    var token = global.turnstile.getResponse(st.widgetId);
    return token ? String(token) : "";
  }

  function resetCaptcha(formId) {
    var st = captchaState[formId];
    if (!st || st.widgetId == null || !global.turnstile) return;
    global.turnstile.reset(st.widgetId);
  }

  function login(plain, turnstileToken) {
    var prefix = apiBase().replace(/\/$/, "");
    var url = (prefix ? prefix : "") + "/api/login";
    return fetchLoginChallenge()
      .then(function (challenge) {
        return fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            password: plain,
            turnstileToken: turnstileToken || "",
            challenge: {
              id: challenge.id,
              iat: challenge.iat,
              mac: challenge.mac,
            },
          }),
        });
      })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) {
            var msg = (body && body.error) || "登录失败";
            throw new Error(msg);
          }
          if (!body || !body.ok || !body.csrfToken) {
            throw new Error("服务器未返回会话凭证");
          }
          setToken(String(body.csrfToken));
          return true;
        });
      })
      .catch(function (err) {
        if (err instanceof TypeError) {
          throw new Error("无法连接服务器，请确认后端已部署且地址正确");
        }
        throw err;
      });
  }

  function logout() {
    var prefix = apiBase().replace(/\/$/, "");
    var url = (prefix ? prefix : "") + "/api/logout";
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    })
      .catch(function () {
        return null;
      })
      .then(function () {
        setToken("");
      });
  }

  function isLoggedIn() {
    return sessionStorage.getItem(LOGIN_MARKER_KEY) === "1" && !!getToken();
  }

  global.ClubAuth = {
    login: login,
    logout: logout,
    isLoggedIn: isLoggedIn,
    getToken: getToken,
    captchaEnabled: captchaEnabled,
    ensureCaptcha: ensureCaptcha,
    captchaToken: captchaToken,
    resetCaptcha: resetCaptcha,
  };
})(typeof window !== "undefined" ? window : this);
