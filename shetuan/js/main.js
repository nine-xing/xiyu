(function () {
  "use strict";

  var GRADIENTS = [
    "linear-gradient(135deg, #0c1218 0%, #1a2832 50%, #0d1820 100%)",
    "linear-gradient(135deg, #101820 0%, #1e3040 45%, #0f1a22 100%)",
    "linear-gradient(135deg, #0a1018 0%, #152535 50%, #0c1520 100%)",
  ];

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fileNameFromUrl(u) {
    try {
      var path = String(u).split("?")[0];
      var parts = path.split("/");
      return parts[parts.length - 1] || "download";
    } catch (e) {
      return "download";
    }
  }

  function isSiteCoverAssetUrl(url) {
    if (!url) return false;
    var s = String(url).split("?")[0];
    return /(^|\/)event-card-default\.png$/i.test(s);
  }

  var revealObserver = null;
  var chapterObserver = null;
  var cassetteYears = [];
  var cassetteIndex = 0;

  function disconnectObservers() {
    if (revealObserver) {
      revealObserver.disconnect();
      revealObserver = null;
    }
    if (chapterObserver) {
      chapterObserver.disconnect();
      chapterObserver = null;
    }
  }

  function initReveal() {
    var nodes = document.querySelectorAll("[data-reveal]");
    if (!nodes.length) return;
    if (!("IntersectionObserver" in window)) {
      nodes.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }
    revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    nodes.forEach(function (el) {
      revealObserver.observe(el);
    });
  }

  function initChapterNav() {
    var chapters = document.querySelectorAll(".chapter[data-chapter]");
    var links = document.querySelectorAll(".nav-chapters__link");
    if (!chapters.length || !links.length) return;

    function setActive(id) {
      links.forEach(function (a) {
        var href = a.getAttribute("href") || "";
        a.classList.toggle("is-active", href === "#" + id);
      });
    }

    if ("IntersectionObserver" in window) {
      chapterObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              setActive(entry.target.id);
            }
          });
        },
        { root: null, rootMargin: "-45% 0px -45% 0px", threshold: 0 }
      );
      chapters.forEach(function (ch) {
        chapterObserver.observe(ch);
      });
    }

    var first = document.querySelector(".chapter");
    if (first && first.id) setActive(first.id);
  }

  function renderHero(hero) {
    var titleEl = document.getElementById("hero-title");
    var accentEl = document.getElementById("hero-title-accent");
    var leadEl = document.getElementById("hero-lead");
    if (titleEl) titleEl.textContent = hero.title || "";
    if (accentEl) accentEl.textContent = hero.titleAccent || "";
    if (leadEl) leadEl.textContent = hero.lead || "";
  }

  function renderNavAndTracks(years) {
    var nav = document.getElementById("nav-chapters");
    var desc = document.getElementById("tape-desc");
    if (!nav) return;

    nav.innerHTML = "";
    cassetteYears = years.slice();
    cassetteIndex = 0;

    if (!years.length) {
      if (desc) {
        desc.textContent =
          "暂无曲目。登录后在「编辑」中添加年份与上、下篇内容，保存后主界面会同步更新。";
      }
      return;
    }

    if (desc) {
      desc.textContent =
        "每个曲目对应一个自然年；每年分「上篇」（上半年）与「下篇」（下半年）。点击左侧切换年份。";
    }

    years.forEach(function (y, i) {
      var id = "year-" + y.year;
      var a = document.createElement("a");
      a.href = "#" + id;
      a.className = "nav-chapters__link";
      a.textContent = y.year + " 年";
      nav.appendChild(a);
    });
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

  function collectYearEvents(yearObj) {
    var events = [];
    var first = yearObj.firstHalf && Array.isArray(yearObj.firstHalf.beats)
      ? yearObj.firstHalf.beats
      : [];
    var second = yearObj.secondHalf && Array.isArray(yearObj.secondHalf.beats)
      ? yearObj.secondHalf.beats
      : [];

    first.forEach(function (b, idx) {
      events.push({
        anchorId: "event-" + yearObj.year + "-first-" + idx,
        title: b.title || "未命名事件",
        date: b.date || (yearObj.year + " 上半年"),
        sortValue: parseEventTimeValue(b.date, yearObj.year, 0, idx),
      });
    });
    second.forEach(function (b, idx) {
      events.push({
        anchorId: "event-" + yearObj.year + "-second-" + idx,
        title: b.title || "未命名事件",
        date: b.date || (yearObj.year + " 下半年"),
        sortValue: parseEventTimeValue(b.date, yearObj.year, 1, idx),
      });
    });
    events.sort(function (a, b) {
      return a.sortValue - b.sortValue;
    });
    return events;
  }

  function renderCurrentEventList() {
    var listEl = document.getElementById("tape-event-list");
    if (!listEl) return;
    if (!cassetteYears.length) {
      listEl.innerHTML = '<p class="tape-event-list__empty">暂无事件</p>';
      return;
    }
    var currentYear = cassetteYears[cassetteIndex];
    var events = collectYearEvents(currentYear);
    if (!events.length) {
      listEl.innerHTML =
        '<p class="tape-event-list__empty">' +
        currentYear.year +
        " 年暂无事件</p>";
      return;
    }

    listEl.innerHTML = events
      .map(function (ev) {
        return (
          '<a class="tape-event-link" href="#' +
          escapeHtml(ev.anchorId) +
          '">' +
          '<span class="tape-event-link__title">' +
          escapeHtml(ev.title) +
          "</span>" +
          '<span class="tape-event-link__date">' +
          escapeHtml(ev.date) +
          "</span>" +
          "</a>"
        );
      })
      .join("");
  }

  function renderCassetteLabel() {
    var sub = document.querySelector(".cassette__label-sub");
    var jumpBtn = document.getElementById("cassette-jump");
    var prevBtn = document.getElementById("cassette-prev");
    var nextBtn = document.getElementById("cassette-next");
    if (!sub || !jumpBtn || !prevBtn || !nextBtn) return;

    if (!cassetteYears.length) {
      sub.textContent = "暂无年份";
      jumpBtn.disabled = true;
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      renderCurrentEventList();
      return;
    }

    var year = cassetteYears[cassetteIndex];
    sub.textContent = year.year + " 年";
    jumpBtn.disabled = false;
    prevBtn.disabled = cassetteYears.length < 2;
    nextBtn.disabled = cassetteYears.length < 2;
    renderCurrentEventList();
  }

  function bindCassetteSwitch() {
    var prevBtn = document.getElementById("cassette-prev");
    var nextBtn = document.getElementById("cassette-next");
    var jumpBtn = document.getElementById("cassette-jump");
    if (!prevBtn || !nextBtn || !jumpBtn) return;

    prevBtn.onclick = function () {
      if (!cassetteYears.length) return;
      cassetteIndex =
        (cassetteIndex - 1 + cassetteYears.length) % cassetteYears.length;
      renderCassetteLabel();
    };

    nextBtn.onclick = function () {
      if (!cassetteYears.length) return;
      cassetteIndex = (cassetteIndex + 1) % cassetteYears.length;
      renderCassetteLabel();
    };

    jumpBtn.onclick = function () {
      if (!cassetteYears.length) return;
      var y = cassetteYears[cassetteIndex];
      if (!y) return;
      location.hash = "year-" + y.year;
    };

  }

  function renderBeat(beat, anchorId) {
    var media = Array.isArray(beat.media) && beat.media.length
      ? beat.media
      : (Array.isArray(beat.images) ? beat.images.map(function (src) {
          return { type: "image", url: src };
        }) : []);
    media = media.filter(function (m) {
      return m && m.url && !isSiteCoverAssetUrl(m.url);
    });
    var gallery =
      media.length > 0
        ? '<div class="beat__gallery">' +
          media
            .map(function (m) {
              if (!m || !m.url) return "";
              var fn = escapeHtml(fileNameFromUrl(m.url));
              var dl =
                '<a class="beat__dl" href="' +
                escapeHtml(m.url) +
                '" download="' +
                fn +
                '" target="_blank" rel="noopener noreferrer">' +
                (m.type === "video" ? "下载视频" : "下载图片") +
                "</a>";
              if (m.type === "video") {
                return (
                  '<figure class="beat__figure">' +
                  '<video src="' +
                  escapeHtml(m.url) +
                  '" class="beat__video" controls preload="metadata" playsinline></video>' +
                  dl +
                  "</figure>"
                );
              }
              return (
                '<figure class="beat__figure">' +
                '<img src="' +
                escapeHtml(m.url) +
                '" alt="" class="beat__img" loading="lazy" />' +
                dl +
                "</figure>"
              );
            })
            .join("") +
          "</div>"
        : "";

    return (
      '<article class="beat reveal" data-reveal id="' +
      escapeHtml(anchorId || "") +
      '">' +
      '<div class="beat__bar"></div>' +
      '<div class="beat__body">' +
      '<time class="beat__date" datetime="' +
      escapeHtml(beat.date || "") +
      '">' +
      escapeHtml(beat.date || "") +
      "</time>" +
      '<h3 class="beat__title">' +
      escapeHtml(beat.title || "") +
      "</h3>" +
      '<p class="beat__text beat__text--multiline">' +
      escapeHtml(beat.text || "") +
      "</p>" +
      gallery +
      "</div></article>"
    );
  }

  function renderHalf(title, synopsis, beats, yearValue, halfKey) {
    var syn =
      synopsis && String(synopsis).trim()
        ? '<p class="half__synopsis">' + escapeHtml(synopsis) + "</p>"
        : "";
    var beatHtml = (beats || [])
      .map(function (b, idx) {
        var anchorId = "event-" + yearValue + "-" + halfKey + "-" + idx;
        return renderBeat(b, anchorId);
      })
      .join("");
    if (!beatHtml && !syn) {
      beatHtml =
        '<p class="half__empty">本段暂无记录，可在编辑后台添加。</p>';
    }
    return (
      '<section class="half">' +
      '<h3 class="half__title">' +
      title +
      "</h3>" +
      syn +
      '<div class="beats">' +
      beatHtml +
      "</div></section>"
    );
  }

  function renderChapters(years) {
    var root = document.getElementById("chapters-root");
    if (!root) return;

    if (!years.length) {
      root.innerHTML =
        '<div class="empty-state" id="empty-placeholder">' +
        '<p class="empty-state__text">还没有任何年份记录。</p>' +
        '<p class="empty-state__hint">请使用管理员账号在「登录」后进入「编辑」添加。</p>' +
        "</div>";
      return;
    }

    var html = "";
    years.forEach(function (y, i) {
      var id = "year-" + y.year;
      var grad = GRADIENTS[i % GRADIENTS.length];
      var fh = y.firstHalf || { synopsis: "", beats: [] };
      var sh = y.secondHalf || { synopsis: "", beats: [] };
      var yearSyn = y.synopsis && String(y.synopsis).trim()
        ? '<p class="chapter__synopsis">' + escapeHtml(y.synopsis) + "</p>"
        : '<p class="chapter__synopsis">该年纪要事概览可在编辑中填写「本年简介」。</p>';

      html +=
        '<article class="chapter" id="' +
        id +
        '" data-chapter="' +
        i +
        '">' +
        '<div class="chapter__backdrop" style="--chapter-bg: ' +
        grad +
        '"></div>' +
        '<div class="chapter__inner">' +
        '<header class="chapter__head">' +
        '<span class="chapter__index">YEAR · ' +
        y.year +
        "</span>" +
        '<h2 class="chapter__title">' +
        y.year +
        " 年</h2>" +
        yearSyn +
        "</header>" +
        renderHalf("上篇 · 上半年", fh.synopsis, fh.beats, y.year, "first") +
        renderHalf("下篇 · 下半年", sh.synopsis, sh.beats, y.year, "second") +
        "</div></article>";
    });

    root.innerHTML = html;
  }

  function renderAll() {
    var data = ClubStorage.load();
    ClubStorage.sortYears(data);
    renderHero(data.hero || {});
    renderNavAndTracks(data.years);
    renderChapters(data.years);
    renderCassetteLabel();
  }

  function refresh() {
    disconnectObservers();
    renderAll();
    initReveal();
    initChapterNav();
  }

  function initBackToTop() {
    var btn = document.getElementById("back-to-top");
    if (!btn) return;
    var threshold = 240;
    function sync() {
      var y = window.scrollY || document.documentElement.scrollTop || 0;
      if (y > threshold) {
        btn.hidden = false;
        btn.setAttribute("aria-hidden", "false");
      } else {
        btn.hidden = true;
        btn.setAttribute("aria-hidden", "true");
      }
    }
    window.addEventListener("scroll", sync, { passive: true });
    sync();
    btn.addEventListener("click", function () {
      var reduce =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({
        top: 0,
        behavior: reduce ? "auto" : "smooth",
      });
    });
  }

  function initHeaderAuth() {
    var navLogin = document.getElementById("nav-login");
    var navEditor = document.getElementById("nav-editor");
    if (!navLogin || !navEditor) return;

    function apply() {
      if (ClubAuth.isLoggedIn()) {
        navEditor.style.display = "inline-flex";
        navLogin.textContent = "登出";
        navLogin.href = "#";
        navLogin.onclick = function (e) {
          e.preventDefault();
          ClubAuth.logout().finally(function () {
            location.reload();
          });
        };
      } else {
        navEditor.style.display = "none";
        navLogin.textContent = "登录";
        navLogin.href = "login.html";
        navLogin.onclick = null;
      }
    }
    apply();
  }

  function init() {
    if (ClubStorage.subscribeSync) {
      ClubStorage.subscribeSync(refresh);
    }
    function afterHydrate() {
      renderAll();
      bindCassetteSwitch();
      initReveal();
      initChapterNav();
      initHeaderAuth();
      initBackToTop();
    }
    if (ClubStorage.hydrateFromServer) {
      ClubStorage.hydrateFromServer().finally(afterHydrate);
    } else {
      afterHydrate();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
