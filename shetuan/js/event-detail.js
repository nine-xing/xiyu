(function () {
  "use strict";

  var commentsCtx = null;
  var commentsEscBound = false;
  var commentsModalCloseBound = false;
  var commentsFormSubmitBound = false;

  function apiPrefix() {
    var base = (window.ClubApiConfig && window.ClubApiConfig.baseUrl) || "";
    return String(base).replace(/\/$/, "");
  }

  /** Avoid res.json() throwing when PHP prints HTML warnings before JSON. */
  function parseJsonFromResponse(res, nonJsonHint) {
    return res.text().then(function (text) {
      var body = null;
      if (text) {
        text = text.replace(/^\uFEFF/, "").trim();
        try {
          body = JSON.parse(text);
        } catch (ignore) {
          throw new Error(
            nonJsonHint ||
              "服务器返回了非 JSON（常见原因：PHP 警告混入输出、或接口地址未指到 PHP）。请确认 backend/data 可写，并检查 Nginx 是否把 /api/* 交给 PHP。"
          );
        }
      }
      return { ok: res.ok, status: res.status, body: body };
    });
  }

  function teardownCommentsUI() {
    commentsCtx = null;
    var fab = document.getElementById("detail-comments-fab");
    if (fab) {
      fab.hidden = true;
      fab.onclick = null;
    }
    var modal = document.getElementById("comments-modal");
    if (modal) {
      modal.hidden = true;
    }
    document.body.style.overflow = "";
  }

  function formatCommentTime(ts) {
    var n = parseInt(ts, 10);
    if (!n || isNaN(n)) return "";
    var d = new Date(n * 1000);
    var pad = function (x) {
      return ("0" + x).slice(-2);
    };
    return (
      d.getFullYear() +
      "-" +
      pad(d.getMonth() + 1) +
      "-" +
      pad(d.getDate()) +
      " " +
      pad(d.getHours()) +
      ":" +
      pad(d.getMinutes())
    );
  }

  function deleteOneComment(commentId) {
    if (!commentsCtx || !commentId) return;
    if (!window.confirm("确定要删除这条评论吗？删除后无法恢复。")) return;
    var csrf = ClubAuth.getToken ? ClubAuth.getToken() : "";
    if (!csrf) {
      alert("请先登录后再删除评论。");
      return;
    }
    /* 使用 .php 直连：纯 Nginx（宝塔）不读 .htaccess，/api/comments-delete 易 404 成 HTML */
    var url =
      (apiPrefix() ? apiPrefix() : "") + "/api/comments_delete.php";
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
      },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({
        year: commentsCtx.year,
        beatId: commentsCtx.beatId || "",
        half: commentsCtx.half || "first",
        index: commentsCtx.index != null ? commentsCtx.index : 0,
        commentId: String(commentId),
      }),
    })
      .then(function (res) {
        return parseJsonFromResponse(
          res,
          "删除接口返回了网页而非 JSON。请确认已上传 comments_delete.php，且浏览器能访问 /api/comments_delete.php（宝塔需在网站目录中存在该文件）。"
        ).then(function (r) {
          if (r.status === 401 || r.status === 403) {
            throw new Error(
              (r.body && r.body.error) || "无权限或登录已过期，请重新登录"
            );
          }
          if (!r.ok) {
            throw new Error((r.body && r.body.error) || "删除失败");
          }
          return fetchCommentsList();
        });
      })
      .catch(function (err) {
        alert((err && err.message) || "删除失败");
      });
  }

  function renderCommentsList(items) {
    var list = document.getElementById("comments-list");
    if (!list) return;
    list.innerHTML = "";
    var isAdmin = ClubAuth.isLoggedIn && ClubAuth.isLoggedIn();
    if (!items || !items.length) {
      var empty = document.createElement("p");
      empty.className = "mc-comments-modal__empty";
      empty.textContent = "暂无评论，来写第一条吧。";
      list.appendChild(empty);
      return;
    }
    items.forEach(function (c) {
      var wrap = document.createElement("div");
      wrap.className = "mc-comment-item";
      var meta = document.createElement("div");
      meta.className = "mc-comment-item__meta";
      var main = document.createElement("div");
      main.className = "mc-comment-item__meta-main";
      var nick = document.createElement("span");
      nick.className = "mc-comment-item__nick";
      nick.textContent = (c && c.nick) || "访客";
      main.appendChild(nick);
      main.appendChild(document.createTextNode(" · "));
      main.appendChild(
        document.createTextNode(formatCommentTime(c && c.createdAt))
      );
      meta.appendChild(main);
      if (isAdmin && c && c.id) {
        var del = document.createElement("button");
        del.type = "button";
        del.className = "mc-comment-item__del";
        del.setAttribute("aria-label", "删除此评论");
        del.setAttribute("title", "删除");
        del.textContent = "×";
        (function (cid) {
          del.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            deleteOneComment(cid);
          });
        })(c.id);
        meta.appendChild(del);
      }
      var text = document.createElement("p");
      text.className = "mc-comment-item__text";
      text.textContent = (c && c.text) || "";
      wrap.appendChild(meta);
      wrap.appendChild(text);
      list.appendChild(wrap);
    });
  }

  function fetchCommentsList() {
    if (!commentsCtx) return Promise.resolve();
    var q = new URLSearchParams();
    q.set("year", String(commentsCtx.year));
    if (commentsCtx.beatId) q.set("beatId", String(commentsCtx.beatId));
    q.set("half", commentsCtx.half || "first");
    q.set("index", String(commentsCtx.index != null ? commentsCtx.index : 0));
    var url = (apiPrefix() ? apiPrefix() : "") + "/api/comments?" + q.toString();
    return fetch(url, { credentials: "omit", cache: "no-store" })
      .then(function (res) {
        return parseJsonFromResponse(res).then(function (r) {
          if (!r.ok) throw new Error("load");
          return (r.body && r.body.comments) || [];
        });
      })
      .then(function (arr) {
        renderCommentsList(arr);
      })
      .catch(function () {
        renderCommentsList([]);
      });
  }

  function openCommentsModal() {
    var modal = document.getElementById("comments-modal");
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    fetchCommentsList();
  }

  function closeCommentsModal() {
    var modal = document.getElementById("comments-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  function initCommentsUI(ctx) {
    teardownCommentsUI();
    commentsCtx = ctx;
    var fab = document.getElementById("detail-comments-fab");
    var modal = document.getElementById("comments-modal");
    var form = document.getElementById("comments-form");
    var errEl = document.getElementById("comments-form-error");
    if (!fab || !modal) return;

    /* 始终显示按钮（原先依赖滚动底部 IntersectionObserver，易因未滚到底/布局而不出现） */
    fab.hidden = false;
    fab.onclick = function () {
      openCommentsModal();
    };

    if (!commentsModalCloseBound) {
      commentsModalCloseBound = true;
      modal.querySelectorAll("[data-comments-close]").forEach(function (node) {
        node.addEventListener("click", closeCommentsModal);
      });
    }

    if (!commentsEscBound) {
      commentsEscBound = true;
      document.addEventListener("keydown", function (ev) {
        var m = document.getElementById("comments-modal");
        if (ev.key === "Escape" && m && !m.hidden) closeCommentsModal();
      });
    }

    if (form && !commentsFormSubmitBound) {
      commentsFormSubmitBound = true;
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!commentsCtx) return;
        if (errEl) errEl.textContent = "";
        var fd = new FormData(form);
        var nick = (fd.get("nick") || "").toString().trim();
        var text = (fd.get("text") || "").toString().trim();
        var url = (apiPrefix() ? apiPrefix() : "") + "/api/comments";
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "omit",
          cache: "no-store",
          body: JSON.stringify({
            year: commentsCtx.year,
            beatId: commentsCtx.beatId || "",
            half: commentsCtx.half || "first",
            index: commentsCtx.index != null ? commentsCtx.index : 0,
            nick: nick,
            text: text,
          }),
        })
          .then(function (res) {
            return parseJsonFromResponse(res).then(function (r) {
              if (!r.ok) {
                throw new Error(
                  (r.body && r.body.error) || "发送失败 (" + r.status + ")"
                );
              }
              form.reset();
              return fetchCommentsList();
            });
          })
          .catch(function (err) {
            if (errEl) errEl.textContent = (err && err.message) || "发送失败";
          });
      });
    }
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

  function beatMediaList(beat) {
    if (Array.isArray(beat.media) && beat.media.length) return beat.media;
    if (Array.isArray(beat.images)) {
      return beat.images.map(function (src) {
        return { type: "image", url: src };
      });
    }
    return [];
  }

  function isSiteCoverAssetUrl(url) {
    if (!url) return false;
    var s = String(url).split("?")[0];
    return /(^|\/)event-card-default\.png$/i.test(s);
  }

  function beatAttachmentsOnly(beat) {
    return beatMediaList(beat).filter(function (m) {
      return m && m.url && !isSiteCoverAssetUrl(m.url);
    });
  }

  function findBeatInYear(y, beatId, half, index) {
    if (beatId) {
      var idStr = String(beatId);
      var fh = (y.firstHalf && y.firstHalf.beats) || [];
      for (var i = 0; i < fh.length; i++) {
        if (String(fh[i].id || "") === idStr) {
          return { beat: fh[i], half: "first", index: i };
        }
      }
      var sh = (y.secondHalf && y.secondHalf.beats) || [];
      for (var j = 0; j < sh.length; j++) {
        if (String(sh[j].id || "") === idStr) {
          return { beat: sh[j], half: "second", index: j };
        }
      }
      return null;
    }
    if (isNaN(index) || index < 0) return null;
    var halfKey = half === "second" ? "secondHalf" : "firstHalf";
    var beats = (y[halfKey] && y[halfKey].beats) || [];
    var beat = beats[index];
    return beat ? { beat: beat, half: half, index: index } : null;
  }

  function render() {
    var params = new URLSearchParams(location.search);
    var year = parseInt(params.get("year") || "", 10);
    var beatId = params.get("beatId");
    var half = params.get("half") || "first";
    var index = parseInt(params.get("index") || "0", 10);

    var missing = document.getElementById("detail-missing");
    var content = document.getElementById("detail-content");
    var editLink = document.getElementById("detail-edit-link");

    var returnPage =
      location.pathname.replace(/^.*\//, "") + (location.search || "") ||
      "event-detail.html";

    if (editLink) {
      editLink.style.display = "inline";
      if (ClubAuth.isLoggedIn()) {
        editLink.textContent = "编辑此事件";
        editLink.href = "editor.html";
      } else {
        editLink.textContent = "登录后编辑";
        editLink.href =
          "login.html?return=" + encodeURIComponent(returnPage);
      }
    }

    var backLink = document.getElementById("detail-back-link");
    function setBackToChronicle(yNum, res) {
      if (!backLink) return;
      if (yNum == null || isNaN(yNum)) {
        backLink.href = "xiyu.html";
        return;
      }
      var q = "year=" + encodeURIComponent(String(yNum));
      var ctx = {
        year: Number(yNum),
        beatId: "",
        half: "first",
        index: 0,
        pendingScroll: true,
      };
      if (res && res.beat && res.beat.id) {
        q += "&beatId=" + encodeURIComponent(String(res.beat.id));
        ctx.beatId = String(res.beat.id);
      } else if (res) {
        q +=
          "&half=" +
          encodeURIComponent(res.half || "first") +
          "&index=" +
          encodeURIComponent(String(res.index != null ? res.index : 0));
        ctx.half = res.half || "first";
        ctx.index = res.index != null ? res.index : 0;
      }
      backLink.href = "xiyu.html?" + q;
      try {
        sessionStorage.setItem("xiyuChronicleCtx", JSON.stringify(ctx));
      } catch (eCtx) {
        /* ignore */
      }
    }

    if (isNaN(year)) {
      teardownCommentsUI();
      if (missing) missing.hidden = false;
      if (content) content.hidden = true;
      return;
    }

    var data = ClubStorage.load();
    var y = data.years.find(function (x) {
      return x.year === year;
    });
    if (!y) {
      teardownCommentsUI();
      if (missing) missing.hidden = false;
      if (content) content.hidden = true;
      setBackToChronicle(year, null);
      return;
    }

    var resolved = findBeatInYear(y, beatId, half, index);
    if (!resolved) {
      teardownCommentsUI();
      if (missing) missing.hidden = false;
      if (content) content.hidden = true;
      if (editLink && ClubAuth.isLoggedIn()) {
        editLink.href =
          "editor.html?year=" + encodeURIComponent(String(year));
      }
      setBackToChronicle(year, null);
      return;
    }

    var beat = resolved.beat;
    setBackToChronicle(year, resolved);

    if (missing) missing.hidden = true;
    if (content) content.hidden = false;

    if (editLink && ClubAuth.isLoggedIn()) {
      var href =
        "editor.html?year=" + encodeURIComponent(String(year));
      if (beat.id) {
        href += "&beatId=" + encodeURIComponent(String(beat.id));
      }
      editLink.href = href;
    }

    document.title = (beat.title || "事件") + " · 汐遇史记";
    var titleEl = document.getElementById("detail-title");
    var metaEl = document.getElementById("detail-meta");
    var textEl = document.getElementById("detail-text");
    var gallery = document.getElementById("detail-gallery");

    if (titleEl) titleEl.textContent = beat.title || "未命名事件";
    if (metaEl) {
      var metaParts = [];
      if (beat.date && String(beat.date).trim()) {
        metaParts.push(String(beat.date).trim());
      }
      metaParts.push(String(year) + " 年");
      metaEl.textContent = metaParts.join(" · ");
    }
    if (textEl) textEl.textContent = beat.text || "";

    if (gallery) {
      gallery.innerHTML = "";
      beatAttachmentsOnly(beat).forEach(function (m) {
        if (!m || !m.url) return;
        if (m.type === "video") {
          var fig = document.createElement("figure");
          var v = document.createElement("video");
          v.src = m.url;
          v.controls = true;
          v.preload = "metadata";
          v.playsInline = true;
          fig.appendChild(v);
          var dl = document.createElement("a");
          dl.className = "mc-doc-link";
          dl.href = m.url;
          dl.target = "_blank";
          dl.rel = "noopener noreferrer";
          dl.textContent = "下载视频 · " + fileNameFromUrl(m.url);
          fig.appendChild(dl);
          gallery.appendChild(fig);
        } else if (m.type === "document") {
          var a = document.createElement("a");
          a.className = "mc-doc-link";
          a.href = m.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = "打开文档 · " + fileNameFromUrl(m.url);
          gallery.appendChild(a);
        } else {
          var img = document.createElement("img");
          img.src = m.url;
          img.alt = "";
          gallery.appendChild(img);
          var dl2 = document.createElement("a");
          dl2.className = "mc-doc-link";
          dl2.href = m.url;
          dl2.target = "_blank";
          dl2.rel = "noopener noreferrer";
          dl2.download = fileNameFromUrl(m.url);
          dl2.textContent = "下载图片 · " + fileNameFromUrl(m.url);
          gallery.appendChild(dl2);
        }
      });
    }

    initCommentsUI({
      year: year,
      beatId: beat.id ? String(beat.id) : beatId ? String(beatId) : "",
      half: resolved.half || "first",
      index: resolved.index != null ? resolved.index : 0,
    });
  }

  ClubStorage.hydrateFromServer().finally(render);
})();
