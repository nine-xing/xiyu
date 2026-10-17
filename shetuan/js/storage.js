(function (global) {
  "use strict";

  var STORAGE_KEY = "clubHistory_v1";
  var CHANNEL_NAME = "club-history-sync";

  function apiBase() {
    return (global.ClubApiConfig && global.ClubApiConfig.baseUrl) || "";
  }

  function defaultData() {
    return {
      version: 1,
      hero: {
        title: "未命名的",
        titleAccent: "纪行",
        lead: "将招新、比赛与日常，收进同一卷磁带。向下滚动，逐幕回放。",
      },
      years: [],
    };
  }

  function migrate(raw) {
    if (!raw || typeof raw !== "object") return defaultData();
    if (!raw.hero) raw.hero = defaultData().hero;
    if (!Array.isArray(raw.years)) raw.years = [];
    return raw;
  }

  function emptyHalf() {
    return { synopsis: "", beats: [] };
  }

  function emptyYear(yearNum) {
    return {
      year: yearNum,
      synopsis: "",
      firstHalf: emptyHalf(),
      secondHalf: emptyHalf(),
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      return migrate(JSON.parse(raw));
    } catch (e) {
      return defaultData();
    }
  }

  function notifySync() {
    if (typeof BroadcastChannel !== "undefined") {
      var bc = new BroadcastChannel(CHANNEL_NAME);
      bc.postMessage({ type: "data-updated" });
      bc.close();
    }
  }

  function persistLocal(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      notifySync();
    } catch (e) {
      throw new Error("保存失败：可能超出浏览器存储上限，请减少图片数量。");
    }
  }

  function normalizePayload(data) {
    var copy = JSON.parse(JSON.stringify(data));
    return migrate(copy);
  }

  function save(data) {
    var normalized;
    try {
      normalized = normalizePayload(data);
    } catch (e) {
      return Promise.reject(new Error("数据格式无效"));
    }

    var base = apiBase().replace(/\/$/, "");
    var token =
      global.ClubAuth && typeof ClubAuth.getToken === "function"
        ? ClubAuth.getToken()
        : "";

    if (token) {
      var url = (base ? base : "") + "/api/content";
      return fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        credentials: "same-origin",
        body: JSON.stringify(normalized),
      }).then(function (res) {
        if (res.status === 401) {
          return Promise.reject(new Error("未登录或登录已过期，请重新登录"));
        }
        if (res.status === 403) {
          return Promise.reject(new Error("登录已过期或无效，请重新登录"));
        }
        if (!res.ok) {
          return res.text().then(function (text) {
            var body = null;
            try {
              body = text ? JSON.parse(text) : null;
            } catch (e) {
              if (text && /^\s*</.test(text)) {
                throw new Error(
                  "保存失败：服务器返回了网页而不是 JSON。请检查 /api/content 是否指向 content.php，或 PHP 报错（内容过大时调大 post_max_size）。"
                );
              }
              throw new Error("保存失败（HTTP " + res.status + "）");
            }
            throw new Error((body && body.error) || "保存失败");
          });
        }
        persistLocal(normalized);
      });
    }

    try {
      persistLocal(normalized);
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function mergeWithLocal(serverPayload) {
    var local = load();
    var s = migrate(serverPayload && typeof serverPayload === "object" ? serverPayload : {});
    var byYear = {};
    (local.years || []).forEach(function (y) {
      if (y && typeof y.year === "number") byYear[y.year] = y;
    });
    (s.years || []).forEach(function (y) {
      if (y && typeof y.year === "number") byYear[y.year] = y;
    });
    var years = Object.keys(byYear)
      .map(function (k) {
        return byYear[parseInt(k, 10)];
      })
      .filter(Boolean);
    years.sort(function (a, b) {
      return a.year - b.year;
    });
    var sHero = s.hero || {};
    var lHero = local.hero || {};
    var serverHeroEmpty =
      !String(sHero.title || "").trim() &&
      !String(sHero.titleAccent || "").trim() &&
      !String(sHero.lead || "").trim();
    var hero = serverHeroEmpty ? lHero : sHero;
    return migrate({
      version: Math.max(s.version || 1, local.version || 1),
      hero: hero,
      years: years,
    });
  }

  function hydrateFromServer() {
    var prefix = apiBase().replace(/\/$/, "");
    var url = (prefix ? prefix : "") + "/api/content";
    return fetch(url, { credentials: "omit" })
      .then(function (res) {
        if (!res.ok) throw new Error("bad status");
        return res.json();
      })
      .then(function (payload) {
        var merged = mergeWithLocal(payload);
        persistLocal(merged);
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function subscribeSync(callback) {
    if (typeof callback !== "function") return function () {};
    var bc = null;
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel(CHANNEL_NAME);
      bc.addEventListener("message", function (ev) {
        if (ev.data && ev.data.type === "data-updated") callback();
      });
    }
    function onStorage(ev) {
      if (ev.key === STORAGE_KEY) callback();
    }
    window.addEventListener("storage", onStorage);
    return function () {
      if (bc) bc.close();
      window.removeEventListener("storage", onStorage);
    };
  }

  function sortYears(data) {
    data.years.sort(function (a, b) {
      return a.year - b.year;
    });
  }

  function ensureYear(data, yearNum) {
    var y = data.years.find(function (x) {
      return x.year === yearNum;
    });
    if (!y) {
      y = emptyYear(yearNum);
      data.years.push(y);
      sortYears(data);
    }
    if (!y.firstHalf) y.firstHalf = emptyHalf();
    if (!y.secondHalf) y.secondHalf = emptyHalf();
    if (!Array.isArray(y.firstHalf.beats)) y.firstHalf.beats = [];
    if (!Array.isArray(y.secondHalf.beats)) y.secondHalf.beats = [];
    return y;
  }

  global.ClubStorage = {
    KEY: STORAGE_KEY,
    load: load,
    save: save,
    hydrateFromServer: hydrateFromServer,
    defaultData: defaultData,
    emptyYear: emptyYear,
    emptyHalf: emptyHalf,
    sortYears: sortYears,
    ensureYear: ensureYear,
    subscribeSync: subscribeSync,
  };
})(typeof window !== "undefined" ? window : this);
