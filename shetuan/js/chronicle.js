(function () {
  "use strict";

  /** 主界面事件卡无配图时的默认立绘（与 xiyu.html 同目录相对路径） */
  var EVENT_CARD_DEFAULT_IMG = "tupianziyuan/event-card-default.png";

  var selectedYear = null;
  var carouselEl = null;

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parseEventTimeValue(dateText, fallbackYear, halfOrder, idx) {
    var text = String(dateText || "").trim();
    var m = text.match(/(\d{4})[^\d]?(\d{1,2})?[^\d]?(\d{1,2})?/);
    var year = fallbackYear;
    var month = halfOrder === 0 ? 1 : 7;
    var day = 1;
    if (m) {
      if (m[1]) year = parseInt(m[1], 10);
      if (m[2]) month = parseInt(m[2], 10);
      if (m[3]) day = parseInt(m[3], 10);
    }
    if (!Number.isFinite(year)) year = 0;
    if (!Number.isFinite(month)) month = halfOrder === 0 ? 1 : 7;
    if (!Number.isFinite(day)) day = 1;
    return year * 10000 + month * 100 + day + idx / 1000;
  }

  function collectSortedEvents(yearObj) {
    var out = [];
    var first = (yearObj.firstHalf && yearObj.firstHalf.beats) || [];
    var second = (yearObj.secondHalf && yearObj.secondHalf.beats) || [];
    first.forEach(function (b, idx) {
      out.push({
        beat: b,
        half: "first",
        index: idx,
        sortValue: parseEventTimeValue(b.date, yearObj.year, 0, idx),
      });
    });
    second.forEach(function (b, idx) {
      out.push({
        beat: b,
        half: "second",
        index: idx,
        sortValue: parseEventTimeValue(b.date, yearObj.year, 1, idx),
      });
    });
    out.sort(function (a, b) {
      return b.sortValue - a.sortValue;
    });
    return out;
  }

  function lastEventEditQuery(yearObj) {
    return (
      "editor.html?year=" +
      encodeURIComponent(String(yearObj.year)) +
      "&addBeat=1"
    );
  }

  function eventDetailUrl(yearNum, item) {
    var bid = item.beat && item.beat.id ? String(item.beat.id) : "";
    if (bid) {
      return (
        "event-detail.html?year=" +
        encodeURIComponent(String(yearNum)) +
        "&beatId=" +
        encodeURIComponent(bid)
      );
    }
    return (
      "event-detail.html?year=" +
      encodeURIComponent(String(yearNum)) +
      "&half=" +
      encodeURIComponent(item.half) +
      "&index=" +
      encodeURIComponent(String(item.index))
    );
  }

  function renderYearRail(years) {
    var rail = document.getElementById("year-rail");
    if (!rail) return;
    rail.innerHTML = "";
    years.forEach(function (y) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mc-year-btn";
      btn.textContent = String(y.year);
      btn.title = y.year + " 年";
      btn.setAttribute("data-year", String(y.year));
      btn.addEventListener("click", function () {
        selectYear(y.year);
      });
      rail.appendChild(btn);
    });
    syncYearActive();
  }

  function syncYearActive() {
    document.querySelectorAll(".mc-year-btn").forEach(function (btn) {
      btn.classList.toggle(
        "is-active",
        selectedYear != null && btn.getAttribute("data-year") === String(selectedYear)
      );
    });
  }

  function selectYear(yearNum, opts) {
    selectedYear = Number(yearNum);
    syncYearActive();
    var data = ClubStorage.load();
    var y = data.years.find(function (x) {
      return yearEquals(x.year, yearNum);
    });
    if (!y) return;
    if (!opts || !opts.skipSessionPersist) {
      try {
        sessionStorage.setItem(
          "xiyuChronicleCtx",
          JSON.stringify({
            year: selectedYear,
            beatId: "",
            half: "first",
            index: 0,
            pendingScroll: false,
          })
        );
      } catch (ePersist) {
        /* ignore */
      }
    }
    var enEl = document.getElementById("yearEn");
    var zhEl = document.getElementById("yearZh");
    var synEl = document.getElementById("yearSynopsis");
    if (enEl) enEl.textContent = "YEAR · " + y.year;
    if (zhEl) zhEl.textContent = y.year + " 年";
    if (synEl) {
      synEl.textContent =
        (y.synopsis && String(y.synopsis).trim()) ||
        "本年概览可在「编辑」中填写「本年简介」。";
    }
    renderEventCarousel(y);
  }

  function renderEventCarousel(yearObj) {
    if (!carouselEl) return;
    var list = collectSortedEvents(yearObj);
    var isAdmin = ClubAuth.isLoggedIn();
    var frag = document.createDocumentFragment();

    list.forEach(function (item) {
      var card = document.createElement("article");
      card.className = "char-card";
      card.setAttribute("role", "link");
      card.tabIndex = 0;
      var url = eventDetailUrl(yearObj.year, item);
      function go() {
        try {
          var ctx = {
            year: yearObj.year,
            beatId: item.beat && item.beat.id ? String(item.beat.id) : "",
            half: item.half || "first",
            index: item.index,
            pendingScroll: true,
          };
          sessionStorage.setItem("xiyuChronicleCtx", JSON.stringify(ctx));
        } catch (eGo) {
          /* ignore */
        }
        location.href = url;
      }
      card.addEventListener("click", go);
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      });

      card.setAttribute("data-event-half", item.half);
      card.setAttribute("data-event-index", String(item.index));
      if (item.beat && item.beat.id) {
        card.setAttribute("data-beat-id", String(item.beat.id));
      }

      /* 封面固定为站点默认立绘；上传的图/视频仅作附件，不占轮播封面 */
      var defWrap = document.createElement("div");
      defWrap.className = "char-card__media";
      var defImg = document.createElement("img");
      defImg.src = EVENT_CARD_DEFAULT_IMG;
      defImg.alt = "";
      defImg.decoding = "async";
      defImg.loading = "lazy";
      defWrap.appendChild(defImg);
      card.appendChild(defWrap);

      var overlay = document.createElement("div");
      overlay.className = "char-name-overlay";
      var t1 = document.createElement("div");
      t1.className = "char-name-zh";
      t1.textContent = item.beat.title || "未命名事件";
      var t2 = document.createElement("div");
      t2.className = "char-name-en";
      t2.textContent = item.beat.date || yearObj.year + " 年";
      overlay.appendChild(t1);
      overlay.appendChild(t2);
      card.appendChild(overlay);
      frag.appendChild(card);
    });

    if (!list.length && !isAdmin) {
      var hintCard = document.createElement("article");
      hintCard.className = "char-card char-card--empty-hint";
      var ph = document.createElement("div");
      ph.className = "char-card__placeholder char-card__placeholder--hint";
      ph.textContent = "本年暂无事件。登录后可在「编辑」中添加。";
      hintCard.appendChild(ph);
      frag.appendChild(hintCard);
    }

    if (isAdmin) {
      var addCard = document.createElement("article");
      addCard.className = "char-card char-card--add";
      addCard.innerHTML =
        '<div class="char-card__plus">+</div><div class="char-name-zh">添加事件</div>';
      addCard.addEventListener("click", function () {
        location.href = lastEventEditQuery(yearObj);
      });
      frag.appendChild(addCard);
    }

    carouselEl.innerHTML = "";
    carouselEl.appendChild(frag);
  }

  function consumeReturnFromDetailParams() {
    var params = new URLSearchParams(location.search);
    var py = params.get("year");
    if (py == null || py === "") return null;
    var yn = parseInt(String(py).trim(), 10);
    if (isNaN(yn)) return null;
    return {
      year: yn,
      beatId: params.get("beatId") || "",
      half: params.get("half") || "first",
      index: parseInt(params.get("index") || "0", 10),
    };
  }

  function yearEquals(a, b) {
    return Number(a) === Number(b);
  }

  /** 横向轮播内把卡片滚到可视区中部（scrollIntoView 在 overflow-x 上常不可靠） */
  function scrollCarouselToCard(carousel, card) {
    if (!carousel || !card) return;
    var cRect = carousel.getBoundingClientRect();
    var rRect = card.getBoundingClientRect();
    var delta =
      rRect.left - cRect.left - (cRect.width - rRect.width) / 2;
    var next = Math.round(carousel.scrollLeft + delta);
    var max = Math.max(0, carousel.scrollWidth - carousel.clientWidth);
    carousel.scrollLeft = Math.max(0, Math.min(next, max));
  }

  /** 左右按钮每次滚动：一张卡片 + 与下一张的间距（与 CSS gap 一致） */
  function carouselStepPx(carousel) {
    if (!carousel) return 300;
    var cards = carousel.querySelectorAll(".char-card");
    if (cards.length >= 2) {
      var step = cards[1].offsetLeft - cards[0].offsetLeft;
      if (step > 0) return Math.round(step);
    }
    var first = cards[0];
    if (first) {
      var gapStr = window.getComputedStyle(carousel).gap || "0px";
      var gapPx = parseFloat(gapStr) || 0;
      return Math.round(first.getBoundingClientRect().width + gapPx);
    }
    return 300;
  }

  function clampCarouselScrollLeft(carousel, value) {
    var max = Math.max(0, carousel.scrollWidth - carousel.clientWidth);
    return Math.max(0, Math.min(Math.round(value), max));
  }

  function findCarouselCardForReturn(carousel, ret) {
    if (!carousel || !ret) return null;
    var card = null;
    var bid = ret.beatId ? String(ret.beatId) : "";
    if (bid) {
      carousel.querySelectorAll(".char-card[data-beat-id]").forEach(function (el) {
        if (el.getAttribute("data-beat-id") === bid) card = el;
      });
    }
    if (!card && ret.half != null && !isNaN(ret.index)) {
      var h = ret.half === "second" ? "second" : "first";
      var sel =
        '.char-card[data-event-half="' +
        h +
        '"][data-event-index="' +
        String(ret.index) +
        '"]';
      card = carousel.querySelector(sel);
    }
    return card;
  }

  function persistChronicleYearAfterScroll(yearNum) {
    try {
      sessionStorage.setItem(
        "xiyuChronicleCtx",
        JSON.stringify({
          year: Number(yearNum),
          beatId: "",
          half: "first",
          index: 0,
          pendingScroll: false,
        })
      );
    } catch (eP) {
      /* ignore */
    }
  }

  function focusCarouselOnReturnedEvent(ret) {
    if (!ret || !carouselEl) return;
    function runScroll() {
      var carousel = document.getElementById("event-carousel");
      if (!carousel) return;
      var card = findCarouselCardForReturn(carousel, ret);
      if (card) {
        scrollCarouselToCard(carousel, card);
      }
      setTimeout(function () {
        persistChronicleYearAfterScroll(ret.year);
        if (location.search) {
          try {
            history.replaceState(null, "", location.pathname + location.hash);
          } catch (e1) {
            /* ignore */
          }
        }
      }, 450);
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(runScroll);
    });
  }

  /** URL 参数优先；否则用 sessionStorage（从详情返回时 URL 常被重写或丢失） */
  function getResumeIntentForRefresh() {
    var u = consumeReturnFromDetailParams();
    if (u && !isNaN(Number(u.year))) {
      return {
        year: Number(u.year),
        beatId: u.beatId || "",
        half: u.half || "first",
        index: isNaN(u.index) ? 0 : u.index,
        scroll: true,
      };
    }
    var raw = null;
    try {
      raw = sessionStorage.getItem("xiyuChronicleCtx");
    } catch (e2) {
      return null;
    }
    if (!raw) return null;
    var c = null;
    try {
      c = JSON.parse(raw);
    } catch (e3) {
      return null;
    }
    if (!c || c.year == null || isNaN(Number(c.year))) return null;
    return {
      year: Number(c.year),
      beatId: c.beatId || "",
      half: c.half || "first",
      index: c.index != null ? parseInt(String(c.index), 10) : 0,
      scroll: !!c.pendingScroll,
    };
  }

  function setMainEmpty(isEmpty) {
    var emptyEl = document.getElementById("mc-main-empty");
    var contentEl = document.getElementById("mc-main-content");
    if (emptyEl) emptyEl.hidden = !isEmpty;
    if (contentEl) contentEl.hidden = isEmpty;
  }

  function refresh() {
    var data = ClubStorage.load();
    ClubStorage.sortYears(data);
    carouselEl = document.getElementById("event-carousel");
    if (!data.years.length) {
      setMainEmpty(true);
      renderYearRail([]);
      selectedYear = null;
      return;
    }
    setMainEmpty(false);
    renderYearRail(data.years);
    var hadUrlParams = !!consumeReturnFromDetailParams();
    var intent = getResumeIntentForRefresh();
    if (
      intent &&
      data.years.some(function (x) {
        return yearEquals(x.year, intent.year);
      })
    ) {
      selectedYear = Number(intent.year);
    } else if (
      selectedYear == null ||
      !data.years.some(function (x) {
        return yearEquals(x.year, selectedYear);
      })
    ) {
      selectedYear = data.years[data.years.length - 1].year;
    }
    selectYear(selectedYear, { skipSessionPersist: true });
    var scrollPayload =
      intent && yearEquals(selectedYear, intent.year)
        ? {
            year: intent.year,
            beatId: intent.beatId,
            half: intent.half,
            index: intent.index,
          }
        : null;
    if (scrollPayload && intent.scroll) {
      focusCarouselOnReturnedEvent(scrollPayload);
    } else if (intent && yearEquals(selectedYear, intent.year) && !intent.scroll) {
      persistChronicleYearAfterScroll(intent.year);
    }
    var deferUrlClean =
      location.search &&
      hadUrlParams &&
      intent &&
      yearEquals(selectedYear, intent.year) &&
      intent.scroll;
    if (location.search && !deferUrlClean) {
      try {
        history.replaceState(null, "", location.pathname + location.hash);
      } catch (e2) {
        /* ignore */
      }
    }
  }

  function closeLoginModal() {
    var overlay = document.getElementById("login-modal");
    if (!overlay) return;
    overlay.hidden = true;
    document.body.style.overflow = "";
  }

  function openLoginModal() {
    var overlay = document.getElementById("login-modal");
    if (!overlay) return;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    var err = document.getElementById("login-modal-error");
    if (err) err.textContent = "";
    var pw = document.getElementById("login-modal-password");
    var toggle = document.getElementById("toggle-login-modal-password");
    if (pw) {
      pw.type = "password";
      pw.value = "";
      if (toggle) toggle.checked = false;
      setTimeout(function () {
        pw.focus();
      }, 30);
    }
  }

  function initLoginModal() {
    var overlay = document.getElementById("login-modal");
    if (!overlay) return;
    var closeBtn = document.getElementById("login-modal-close");
    var form = document.getElementById("form-login-modal");
    var err = document.getElementById("login-modal-error");
    var modalFormId = "form-login-modal";
    var modalCaptchaSlotId = "login-modal-turnstile";
    var pw = document.getElementById("login-modal-password");
    var pwToggle = document.getElementById("toggle-login-modal-password");

    if (pw && pwToggle) {
      pwToggle.addEventListener("change", function () {
        pw.type = pwToggle.checked ? "text" : "password";
      });
    }
    if (ClubAuth.captchaEnabled && ClubAuth.captchaEnabled()) {
      ClubAuth.ensureCaptcha(modalFormId, modalCaptchaSlotId).catch(function (er) {
        if (err) err.textContent = (er && er.message) || "验证码加载失败，请刷新重试";
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", closeLoginModal);
    }
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeLoginModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !overlay.hidden) closeLoginModal();
    });
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (err) err.textContent = "";
        var v = pw ? pw.value : "";
        if (!v) {
          if (err) err.textContent = "请输入管理员密钥";
          return;
        }
        var token = "";
        if (ClubAuth.captchaEnabled && ClubAuth.captchaEnabled()) {
          token = ClubAuth.captchaToken ? ClubAuth.captchaToken(modalFormId) : "";
          if (!token) {
            if (err) err.textContent = "请先完成人机验证";
            return;
          }
        }
        ClubAuth.login(v, token)
          .then(function () {
            closeLoginModal();
            initHeaderAuth();
            refresh();
          })
          .catch(function (er) {
            if (ClubAuth.resetCaptcha) ClubAuth.resetCaptcha(modalFormId);
            if (err) err.textContent = (er && er.message) || "登录失败";
          });
      });
    }
  }

  function initHeaderAuth() {
    var navLogin = document.getElementById("nav-login");
    var navEditor = document.getElementById("nav-editor");
    var btnAddYear = document.getElementById("btn-add-year-sidebar");
    function apply() {
      var logged = ClubAuth.isLoggedIn();
      if (navEditor) {
        navEditor.style.display = logged ? "inline" : "none";
      }
      if (btnAddYear) btnAddYear.hidden = !logged;
      if (navLogin) {
        navLogin.onclick = null;
        if (logged) {
          navLogin.textContent = "登出";
          navLogin.href = "#";
          navLogin.onclick = function (e) {
            e.preventDefault();
            ClubAuth.logout().finally(function () {
              location.reload();
            });
          };
        } else {
          navLogin.textContent = "登录";
          navLogin.href = "#";
          navLogin.onclick = function (e) {
            e.preventDefault();
            openLoginModal();
          };
        }
      }
    }
    apply();
  }

  function bindCarouselScroll() {
    carouselEl = document.getElementById("event-carousel");
    var prev = document.getElementById("carousel-prev");
    var next = document.getElementById("carousel-next");
    if (prev && carouselEl) {
      prev.addEventListener("click", function () {
        var step = carouselStepPx(carouselEl);
        carouselEl.scrollLeft = clampCarouselScrollLeft(
          carouselEl,
          carouselEl.scrollLeft - step
        );
      });
    }
    if (next && carouselEl) {
      next.addEventListener("click", function () {
        var step = carouselStepPx(carouselEl);
        carouselEl.scrollLeft = clampCarouselScrollLeft(
          carouselEl,
          carouselEl.scrollLeft + step
        );
      });
    }
    if (carouselEl) {
      carouselEl.addEventListener("wheel", function (evt) {
        if (Math.abs(evt.deltaY) > Math.abs(evt.deltaX)) {
          evt.preventDefault();
          carouselEl.scrollLeft += evt.deltaY;
        }
      }, { passive: false });
    }
  }

  function onAddYear() {
    if (!ClubAuth.isLoggedIn()) {
      openLoginModal();
      return;
    }
    var raw = window.prompt(
      "请输入要添加的年份（四位数字，如 2024）：",
      String(new Date().getFullYear())
    );
    if (raw == null) return;
    var y = parseInt(String(raw).trim(), 10);
    if (isNaN(y) || y < 1990 || y > 2100) {
      alert("年份无效");
      return;
    }
    var data = ClubStorage.load();
    if (data.years.some(function (x) {
      return x.year === y;
    })) {
      alert("该年份已存在");
      return;
    }
    data.years.push(ClubStorage.emptyYear(y));
    ClubStorage.sortYears(data);
    ClubStorage.save(data)
      .then(function () {
        selectedYear = y;
        refresh();
      })
      .catch(function (err) {
        alert((err && err.message) || "保存失败");
      });
  }

  function init() {
    var syncOkAfter = Date.now() + 800;
    carouselEl = document.getElementById("event-carousel");
    bindCarouselScroll();
    initLoginModal();
    initHeaderAuth();
    var btnAddYear = document.getElementById("btn-add-year-sidebar");
    if (btnAddYear) btnAddYear.addEventListener("click", onAddYear);
    ClubStorage.subscribeSync(function () {
      if (Date.now() < syncOkAfter) return;
      refresh();
    });
    refresh();
  }

  ClubStorage.hydrateFromServer().finally(init);
})();
