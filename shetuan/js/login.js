(function () {
  "use strict";

  var formLogin = document.getElementById("form-login");
  var errLogin = document.getElementById("login-error");
  var blockLogged = document.getElementById("block-logged");
  var LOGIN_FORM_ID = "form-login";
  var LOGIN_CAPTCHA_SLOT_ID = "login-turnstile";

  function returnUrl() {
    var p = new URLSearchParams(location.search);
    var r = p.get("return");
    if (!r) return "xiyu.html";
    try {
      r = decodeURIComponent(r);
    } catch (e) {
      return "xiyu.html";
    }
    if (/^https?:|^\/\//i.test(r) || r.indexOf("\0") !== -1) return "xiyu.html";
    return r;
  }

  function showError(el, msg) {
    if (!el) return;
    el.textContent = msg || "";
  }

  function renderMode() {
    if (ClubAuth.isLoggedIn()) {
      if (formLogin) formLogin.style.display = "none";
      if (blockLogged) blockLogged.style.display = "block";
      return;
    }
    if (blockLogged) blockLogged.style.display = "none";
    if (formLogin) formLogin.style.display = "block";
  }

  var pwInput = document.getElementById("login-password");
  var pwToggle = document.getElementById("toggle-login-password");
  if (pwInput && pwToggle) {
    pwToggle.addEventListener("change", function () {
      pwInput.type = pwToggle.checked ? "text" : "password";
    });
  }

  if (ClubAuth.captchaEnabled && ClubAuth.captchaEnabled()) {
    ClubAuth.ensureCaptcha(LOGIN_FORM_ID, LOGIN_CAPTCHA_SLOT_ID).catch(function (err) {
      showError(errLogin, (err && err.message) || "验证码加载失败，请刷新重试");
    });
  }

  if (formLogin) {
    formLogin.addEventListener("submit", function (e) {
      e.preventDefault();
      showError(errLogin, "");
      var pw = document.getElementById("login-password");
      var v = pw ? pw.value : "";
      if (!v) {
        showError(errLogin, "请输入管理员密钥");
        return;
      }
      var token = "";
      if (ClubAuth.captchaEnabled && ClubAuth.captchaEnabled()) {
        token = ClubAuth.captchaToken
          ? ClubAuth.captchaToken(LOGIN_FORM_ID)
          : "";
        if (!token) {
          showError(errLogin, "请先完成人机验证");
          return;
        }
      }
      ClubAuth.login(v, token).then(function () {
        location.href = returnUrl();
      }).catch(function (err) {
        if (ClubAuth.resetCaptcha) ClubAuth.resetCaptcha(LOGIN_FORM_ID);
        showError(errLogin, err.message || "登录失败");
      });
    });
  }

  var btnLogout = document.getElementById("btn-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", function () {
      ClubAuth.logout().finally(function () {
        location.reload();
      });
    });
  }

  var btnGoEditor = document.getElementById("btn-go-editor");
  if (btnGoEditor) {
    btnGoEditor.addEventListener("click", function () {
      location.href = returnUrl();
    });
  }

  renderMode();
})();
