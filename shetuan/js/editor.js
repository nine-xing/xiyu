(function () {
  "use strict";

  if (!ClubAuth.isLoggedIn()) {
    var ret =
      location.pathname.replace(/^.*\//, "") + (location.search || "") ||
      "editor.html";
    location.href = "login.html?return=" + encodeURIComponent(ret);
    return;
  }

  function runEditor() {
  var data = ClubStorage.load();
  var editorLoginReturn =
    location.pathname.replace(/^.*\//, "") + (location.search || "") ||
    "editor.html";
  var yearSelect = document.getElementById("editor-year");
  var yearSynopsis = document.getElementById("year-synopsis");
  var beatsRoot = document.getElementById("beats-editor");
  var btnAddYear = document.getElementById("btn-add-year");
  var btnDelYear = document.getElementById("btn-del-year");
  var btnAddBeat = document.getElementById("btn-add-beat");
  var btnAddBeatBottom = document.getElementById("btn-add-beat-bottom");
  var formSave = document.getElementById("form-editor");
  var saveStatus = document.getElementById("save-status");
  var uploadProgressEl = document.getElementById("upload-progress");

  /** 与主界面事件卡一致；无配图时占位，上传真实文件后自动去掉 */
  var EDITOR_DEFAULT_EVENT_IMG = "tupianziyuan/event-card-default.png";

  var lastYearValue = null;
  var editorMediaPreviewRoot = null;
  var editorMediaPreviewOnKey = null;

  function closeEditorMediaPreview() {
    if (!editorMediaPreviewRoot) return;
    editorMediaPreviewRoot.hidden = true;
    while (editorMediaPreviewRoot.firstChild) {
      editorMediaPreviewRoot.removeChild(editorMediaPreviewRoot.firstChild);
    }
    document.body.style.overflow = "";
    if (editorMediaPreviewOnKey) {
      document.removeEventListener("keydown", editorMediaPreviewOnKey);
      editorMediaPreviewOnKey = null;
    }
  }

  function ensureEditorMediaPreviewRoot() {
    if (editorMediaPreviewRoot) return editorMediaPreviewRoot;
    editorMediaPreviewRoot = document.createElement("div");
    editorMediaPreviewRoot.className = "editor-media-preview";
    editorMediaPreviewRoot.setAttribute("role", "dialog");
    editorMediaPreviewRoot.setAttribute("aria-modal", "true");
    editorMediaPreviewRoot.setAttribute("aria-label", "图片或视频预览");
    editorMediaPreviewRoot.hidden = true;
    editorMediaPreviewRoot.addEventListener("click", function () {
      closeEditorMediaPreview();
    });
    document.body.appendChild(editorMediaPreviewRoot);
    return editorMediaPreviewRoot;
  }

  function openEditorMediaPreview(url, mediaType) {
    if (!url || (mediaType !== "image" && mediaType !== "video")) return;
    var root = ensureEditorMediaPreviewRoot();
    while (root.firstChild) {
      root.removeChild(root.firstChild);
    }
    var inner = document.createElement("div");
    inner.className = "editor-media-preview__inner";
    inner.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "editor-media-preview__close";
    closeBtn.setAttribute("aria-label", "关闭预览");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      closeEditorMediaPreview();
    });
    var body = document.createElement("div");
    body.className = "editor-media-preview__body";
    if (mediaType === "video") {
      var v = document.createElement("video");
      v.className = "editor-media-preview__video";
      v.src = url;
      v.controls = true;
      v.setAttribute("playsinline", "");
      v.preload = "metadata";
      body.appendChild(v);
    } else {
      var img = document.createElement("img");
      img.className = "editor-media-preview__img";
      img.src = url;
      img.alt = "";
      body.appendChild(img);
    }
    inner.appendChild(closeBtn);
    inner.appendChild(body);
    root.appendChild(inner);
    root.hidden = false;
    document.body.style.overflow = "hidden";
    editorMediaPreviewOnKey = function (ev) {
      if (ev.key === "Escape") {
        closeEditorMediaPreview();
      }
    };
    document.addEventListener("keydown", editorMediaPreviewOnKey);
  }

  function ensureMergedBeatsInFirstHalf(y) {
    if (!y.firstHalf) y.firstHalf = ClubStorage.emptyHalf();
    if (!y.secondHalf) y.secondHalf = ClubStorage.emptyHalf();
    var extra = y.secondHalf.beats || [];
    if (extra.length) {
      y.firstHalf.beats = (y.firstHalf.beats || []).concat(extra);
      y.secondHalf.beats = [];
      y.secondHalf.synopsis = "";
    }
  }

  function selectedYearNum() {
    if (!yearSelect || !yearSelect.value) return null;
    return parseInt(yearSelect.value, 10);
  }

  function apiBase() {
    var c = window.ClubApiConfig;
    return ((c && c.baseUrl) || "").replace(/\/$/, "");
  }

  function setUploadProgress(text) {
    if (!uploadProgressEl) return;
    if (!text) {
      uploadProgressEl.hidden = true;
      uploadProgressEl.textContent = "";
      return;
    }
    uploadProgressEl.hidden = false;
    uploadProgressEl.textContent = text;
  }

  function uploadMediaFile(file, onProgress) {
    if (!file) return Promise.reject(new Error("请选择文件"));
    var token = ClubAuth.getToken ? ClubAuth.getToken() : "";
    if (!token) return Promise.reject(new Error("未登录或登录已过期，请重新登录"));
    var fd = new FormData();
    fd.append("file", file);
    var url = (apiBase() ? apiBase() : "") + "/api/upload";
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.withCredentials = true;
      xhr.setRequestHeader("X-CSRF-Token", token);
      xhr.upload.onprogress = function (e) {
        if (
          e.lengthComputable &&
          typeof onProgress === "function" &&
          e.total > 0
        ) {
          onProgress(e.loaded / e.total);
        }
      };
      xhr.onload = function () {
        var text = xhr.responseText || "";
        var body = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch (parseErr) {
          if (text && /^\s*</.test(text)) {
            reject(
              new Error(
                "上传失败：服务器返回了网页而不是数据。常见原因：视频超过 Nginx 或 PHP 上传限制（宝塔里调大 client_max_body_size、upload_max_filesize、post_max_size），或接口未指向 /api/upload.php。"
              )
            );
            return;
          }
          reject(new Error("上传响应无法解析"));
          return;
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(
            new Error(
              (body && body.error) || "上传失败（HTTP " + xhr.status + "）"
            )
          );
          return;
        }
        if (!body || !body.url || !body.type) {
          reject(new Error("上传返回数据无效"));
          return;
        }
        resolve({ type: body.type, url: body.url });
      };
      xhr.onerror = function () {
        reject(new Error("网络错误，上传中断"));
      };
      xhr.send(fd);
    });
  }

  var UPLOAD_PARALLEL = 2;

  function uploadFilesWithPool(files, gal, wrap) {
    var arr = Array.prototype.slice.call(files, 0);
    if (!arr.length) return Promise.resolve();
    var totalBytes = arr.reduce(function (s, f) {
      return s + (f.size || 0);
    }, 0);
    var loadedBytes = arr.map(function () {
      return 0;
    });
    function updateLine() {
      var sum = loadedBytes.reduce(function (a, b) {
        return a + b;
      }, 0);
      var pct =
        totalBytes > 0 ? Math.round((sum / totalBytes) * 100) : 0;
      setUploadProgress("上传中 · " + pct + "%");
    }
    updateLine();
    var nextSlot = 0;
    var active = 0;
    return new Promise(function (resolve, reject) {
      function finish() {
        setUploadProgress("");
        resolve();
      }
      function worker() {
        if (nextSlot >= arr.length && active === 0) {
          finish();
          return;
        }
        while (active < UPLOAD_PARALLEL && nextSlot < arr.length) {
          var slot = nextSlot++;
          var f = arr[slot];
          active++;
          uploadMediaFile(f, function (ratio) {
            loadedBytes[slot] = (f.size || 0) * ratio;
            updateLine();
          })
            .then(function (media) {
              loadedBytes[slot] = f.size || 0;
              updateLine();
              gal.appendChild(createThumb(media, wrap));
              active--;
              if (nextSlot >= arr.length && active === 0) {
                finish();
              } else {
                worker();
              }
            })
            .catch(function (err) {
              setUploadProgress("");
              reject(err);
            });
        }
      }
      worker();
    });
  }

  function newBeat() {
    return {
      id: globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : "b_" + Date.now(),
      date: "",
      title: "",
      text: "",
      images: [],
      media: [],
    };
  }

  function parseBeatDateTs(dateStr) {
    var s = String(dateStr || "").trim();
    if (!s) return null;
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    var y = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10);
    var d = parseInt(m[3], 10);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var dt = Date.UTC(y, mo - 1, d);
    return isNaN(dt) ? null : dt;
  }

  function sortBeatsByDate(beats) {
    var arr = (beats || []).slice();
    var withMeta = arr.map(function (b, idx) {
      var raw = b && typeof b === "object" ? b : {};
      var ts = parseBeatDateTs(raw.date);
      return { beat: raw, ts: ts, idx: idx };
    });
    withMeta.sort(function (a, b) {
      var ad = a.ts;
      var bd = b.ts;
      // 有日期的排前面；同日期按原顺序稳定排序；无日期保持在最后
      if (ad == null && bd == null) return a.idx - b.idx;
      if (ad == null) return 1;
      if (bd == null) return -1;
      if (ad === bd) return a.idx - b.idx;
      return bd - ad; // 最新在前
    });
    return withMeta.map(function (x) { return x.beat; });
  }

  function toDateInputValue(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    var m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
    if (!m) return "";
    var y = m[1];
    var mo = ("0" + parseInt(m[2], 10)).slice(-2);
    var d = ("0" + parseInt(m[3] || "1", 10)).slice(-2);
    return y + "-" + mo + "-" + d;
  }

  function populateYearOptions() {
    ClubStorage.sortYears(data);
    if (!yearSelect) return;
    var cur = yearSelect.value;
    yearSelect.innerHTML = "";
    data.years.forEach(function (y) {
      var opt = document.createElement("option");
      opt.value = String(y.year);
      opt.textContent = y.year + " 年";
      yearSelect.appendChild(opt);
    });
    if (data.years.length) {
      var exists = data.years.some(function (y) {
        return String(y.year) === cur;
      });
      yearSelect.value = exists ? cur : String(data.years[data.years.length - 1].year);
    }
  }

  function getYearRecord() {
    var n = selectedYearNum();
    if (n == null || isNaN(n)) return null;
    return ClubStorage.ensureYear(data, n);
  }

  function loadYearIntoForm() {
    var y = getYearRecord();
    if (!y) {
      if (yearSynopsis) yearSynopsis.value = "";
      if (beatsRoot) beatsRoot.innerHTML = "";
      return;
    }
    ensureMergedBeatsInFirstHalf(y);
    if (yearSynopsis) yearSynopsis.value = y.synopsis || "";
    y.firstHalf.beats = sortBeatsByDate(y.firstHalf.beats || []);
    renderBeatEditors(y.firstHalf.beats || []);
  }

  function collectBeatsFromDom() {
    var rows = beatsRoot ? beatsRoot.querySelectorAll(".beat-editor") : [];
    var list = [];
    rows.forEach(function (row) {
      var id = row.getAttribute("data-beat-id") || newBeat().id;
      var dateEl = row.querySelector(".beat-editor__date");
      var titleEl = row.querySelector(".beat-editor__title");
      var textEl = row.querySelector(".beat-editor__text");
      var media = [];
      row.querySelectorAll(".beat-editor__media").forEach(function (node) {
        var u = node.getAttribute("data-url");
        var t = node.getAttribute("data-type");
        if (
          u &&
          !isDefaultEventPlaceholderUrl(u) &&
          (t === "image" || t === "video" || t === "document")
        ) {
          media.push({ type: t, url: u });
        }
      });
      var imgs = media.filter(function (m) { return m.type === "image"; }).map(function (m) { return m.url; });
      list.push({
        id: id,
        date: dateEl ? dateEl.value.trim() : "",
        title: titleEl ? titleEl.value.trim() : "",
        text: textEl ? textEl.value : "",
        images: imgs,
        media: media,
      });
    });
    return list;
  }

  function persistYearEditor(yearNum) {
    if (yearNum == null || isNaN(yearNum)) return;
    var y = ClubStorage.ensureYear(data, yearNum);
    y.synopsis = yearSynopsis ? yearSynopsis.value.trim() : "";
    if (!y.firstHalf) y.firstHalf = ClubStorage.emptyHalf();
    y.firstHalf.beats = sortBeatsByDate(collectBeatsFromDom());
    y.firstHalf.synopsis = "";
    if (!y.secondHalf) y.secondHalf = ClubStorage.emptyHalf();
    y.secondHalf.beats = [];
    y.secondHalf.synopsis = "";
  }

  var _resortScheduled = false;
  function resortBeatsNow(focusBeatId) {
    var y = getYearRecord();
    if (!y) return;
    persistYearEditor(y.year);
    // persistYearEditor 已排序，这里直接重渲染
    renderBeatEditors(y.firstHalf.beats || []);
    if (focusBeatId && beatsRoot) {
      requestAnimationFrame(function () {
        var row = beatsRoot.querySelector('.beat-editor[data-beat-id="' + focusBeatId + '"]');
        if (!row) return;
        var dateEl = row.querySelector(".beat-editor__date");
        if (dateEl) dateEl.focus();
      });
    }
  }

  function scheduleResort(focusBeatId) {
    if (_resortScheduled) return;
    _resortScheduled = true;
    requestAnimationFrame(function () {
      _resortScheduled = false;
      resortBeatsNow(focusBeatId);
    });
  }

  function renderBeatEditors(beats) {
    if (!beatsRoot) return;
    beatsRoot.innerHTML = "";
    (beats || []).forEach(function (beat) {
      beatsRoot.appendChild(createBeatRow(beat));
    });
  }

  function createBeatRow(beat) {
    var wrap = document.createElement("div");
    wrap.className = "beat-editor";
    var beatId = beat.id || newBeat().id;
    wrap.setAttribute("data-beat-id", beatId);

    var head = document.createElement("div");
    head.className = "beat-editor__head";
    var title = document.createElement("span");
    title.className = "beat-editor__label";
    title.textContent = "幕";
    var btnRemove = document.createElement("button");
    btnRemove.type = "button";
    btnRemove.className = "btn btn--small btn--ghost";
    btnRemove.textContent = "删除本条";
    btnRemove.addEventListener("click", function () {
      wrap.remove();
    });
    head.appendChild(title);
    head.appendChild(btnRemove);
    wrap.appendChild(head);

    var row1 = document.createElement("div");
    row1.className = "beat-editor__row";
    var inDate = document.createElement("input");
    inDate.type = "date";
    inDate.className = "field__input beat-editor__date";
    inDate.value = toDateInputValue(beat.date);
    inDate.addEventListener("change", function () {
      scheduleResort(beatId);
    });
    if (typeof inDate.showPicker === "function") {
      inDate.addEventListener("click", function () {
        try {
          inDate.showPicker();
        } catch (e) {}
      });
      inDate.addEventListener("focus", function () {
        try {
          inDate.showPicker();
        } catch (e) {}
      });
    }
    var inTitle = document.createElement("input");
    inTitle.type = "text";
    inTitle.className = "field__input beat-editor__title";
    inTitle.placeholder = "标题";
    inTitle.value = beat.title || "";
    row1.appendChild(inDate);
    row1.appendChild(inTitle);
    wrap.appendChild(row1);

    var ta = document.createElement("textarea");
    ta.className = "field__input beat-editor__text";
    ta.rows = 4;
    ta.placeholder = "正文";
    ta.value = beat.text || "";
    wrap.appendChild(ta);

    var cover = document.createElement("div");
    cover.className = "beat-editor__cover";
    var coverLabel = document.createElement("span");
    coverLabel.className = "beat-editor__cover-label";
    coverLabel.textContent = "封面";
    var coverImg = document.createElement("img");
    coverImg.className = "beat-editor__cover-img";
    coverImg.src = EDITOR_DEFAULT_EVENT_IMG;
    coverImg.alt = "";
    cover.appendChild(coverLabel);
    cover.appendChild(coverImg);
    wrap.appendChild(cover);

    var gal = document.createElement("div");
    gal.className = "beat-editor__gallery";
    var rawList = Array.isArray(beat.media) && beat.media.length
      ? beat.media
      : (beat.images || []).map(function (src) { return { type: "image", url: src }; });
    rawList.forEach(function (m) {
      if (!m || !m.url || isDefaultEventPlaceholderUrl(m.url)) return;
      gal.appendChild(createThumb(m, wrap));
    });
    wrap.appendChild(gal);

    var fileRow = document.createElement("div");
    fileRow.className = "beat-editor__file";
    var file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*,video/mp4,video/webm,video/quicktime,.pdf,application/pdf";
    file.multiple = true;
    file.addEventListener("change", function () {
      var files = file.files;
      if (!files || !files.length) return;
      uploadFilesWithPool(files, gal, wrap).catch(function (err) {
        alert(err.message || String(err));
      });
      file.value = "";
    });
    fileRow.appendChild(file);
    wrap.appendChild(fileRow);

    var actions = document.createElement("div");
    actions.className = "beat-editor__actions";
    var btnSave = document.createElement("button");
    btnSave.type = "button";
    btnSave.className = "btn btn--small btn--primary";
    btnSave.textContent = "保存";
    btnSave.addEventListener("click", function () {
      btnSave.disabled = true;
      saveCurrentEditor(beatId).finally(function () {
        btnSave.disabled = false;
      });
    });
    actions.appendChild(btnSave);
    wrap.appendChild(actions);

    return wrap;
  }

  function isDefaultEventPlaceholderUrl(url) {
    if (!url) return false;
    var s = String(url).split("?")[0];
    return (
      s === EDITOR_DEFAULT_EVENT_IMG ||
      /(^|\/)event-card-default\.png$/i.test(s)
    );
  }

  function createThumb(media, beatWrap) {
    var src = media && media.url ? media.url : "";
    var type =
      media && media.type === "video"
        ? "video"
        : media && media.type === "document"
          ? "document"
          : "image";
    var fig = document.createElement("figure");
    fig.className = "beat-editor__thumb beat-editor__media";
    fig.setAttribute("data-url", src);
    fig.setAttribute("data-type", type);
    var node;
    if (type === "video") {
      node = document.createElement("video");
      node.className = "beat-editor__video";
      node.src = src;
      node.controls = true;
      node.preload = "metadata";
    } else if (type === "document") {
      node = document.createElement("div");
      node.className = "beat-editor__doc";
      var a = document.createElement("a");
      a.href = src;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      try {
        var path = String(src).split("?")[0];
        var seg = path.split("/");
        a.textContent = seg[seg.length - 1] || "文档";
      } catch (e0) {
        a.textContent = "文档";
      }
      node.appendChild(a);
    } else {
      node = document.createElement("img");
      node.className = "beat-editor__img";
      node.src = src;
      node.alt = "";
    }
    if ((type === "image" || type === "video") && src) {
      node.setAttribute(
        "title",
        type === "video" ? "双击预览视频" : "双击查看大图"
      );
      node.addEventListener("dblclick", function (e) {
        e.preventDefault();
        e.stopPropagation();
        openEditorMediaPreview(src, type);
      });
    }
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "beat-editor__rm";
    rm.textContent = "×";
    rm.addEventListener("click", function () {
      fig.remove();
    });
    fig.appendChild(node);
    if (src && type !== "document") {
      var dl = document.createElement("a");
      dl.className = "beat-editor__dl";
      dl.href = src;
      dl.textContent = type === "video" ? "下载视频" : "下载图片";
      dl.target = "_blank";
      dl.rel = "noopener noreferrer";
      try {
        var path = String(src).split("?")[0];
        var seg = path.split("/");
        dl.download = seg[seg.length - 1] || "file";
      } catch (e2) {
        dl.download = "file";
      }
      fig.appendChild(dl);
    }
    fig.appendChild(rm);
    return fig;
  }

  function flashSaved() {
    if (!saveStatus) return;
    saveStatus.textContent = "已保存 · 主界面将同步更新";
    saveStatus.classList.add("is-on");
    setTimeout(function () {
      saveStatus.classList.remove("is-on");
      saveStatus.textContent = "";
    }, 2800);
  }

  function saveCurrentEditor(keepBeatId) {
    var n = selectedYearNum();
    if (n != null && !isNaN(n)) {
      persistYearEditor(n);
    }
    return ClubStorage.save(data)
      .then(function () {
        flashSaved();
        if (n != null && !isNaN(n)) {
          loadYearIntoForm();
        }
        if (keepBeatId && beatsRoot) {
          requestAnimationFrame(function () {
            var row = beatsRoot.querySelector(
              '.beat-editor[data-beat-id="' + keepBeatId + '"]'
            );
            if (row) row.scrollIntoView({ block: "center", behavior: "smooth" });
          });
        }
      })
      .catch(function (err) {
        var msg = (err && err.message) || String(err) || "保存失败";
        alert(msg);
        if (/登录|过期|无效|未登录/.test(msg)) {
          location.href = "login.html?return=" + encodeURIComponent(editorLoginReturn);
        }
        throw err;
      });
  }

  if (btnAddYear) {
    btnAddYear.addEventListener("click", function () {
      var raw = window.prompt("请输入要添加的年份（四位数字，如 2024）：", String(new Date().getFullYear()));
      if (raw == null) return;
      var y = parseInt(String(raw).trim(), 10);
      if (isNaN(y) || y < 1990 || y > 2100) {
        alert("年份无效");
        return;
      }
      if (data.years.some(function (x) { return x.year === y; })) {
        alert("该年份已存在");
        return;
      }
      data.years.push(ClubStorage.emptyYear(y));
      ClubStorage.sortYears(data);
      populateYearOptions();
      if (yearSelect) {
        yearSelect.value = String(y);
        lastYearValue = yearSelect.value;
      }
      loadYearIntoForm();
      persistYearEditor(y);
      ClubStorage.save(data)
        .then(function () {
          flashSaved();
        })
        .catch(function (err) {
          alert((err && err.message) || "保存失败");
        });
    });
  }

  if (btnDelYear) {
    btnDelYear.addEventListener("click", function () {
      var n = selectedYearNum();
      if (n == null) return;
      if (!window.confirm("确定删除 " + n + " 年及其全部事件？")) return;
      persistYearEditor(n);
      data.years = data.years.filter(function (x) {
        return x.year !== n;
      });
      ClubStorage.save(data)
        .then(function () {
          populateYearOptions();
          loadYearIntoForm();
          flashSaved();
        })
        .catch(function (err) {
          var msg = err.message || String(err);
          alert(msg);
          if (/登录|过期|无效|未登录/.test(msg)) {
            location.href =
              "login.html?return=" + encodeURIComponent(editorLoginReturn);
          }
        });
    });
  }

  if (yearSelect) {
    yearSelect.addEventListener("focus", function () {
      lastYearValue = yearSelect.value;
    });
    yearSelect.addEventListener("change", function () {
      var prev = lastYearValue;
      if (prev) {
        persistYearEditor(parseInt(prev, 10));
      }
      lastYearValue = yearSelect.value;
      loadYearIntoForm();
    });
  }

  function appendNewBeatRow() {
    if (!beatsRoot) return;
    beatsRoot.appendChild(createBeatRow(newBeat()));
  }

  function prependNewBeatRow() {
    if (!beatsRoot) return;
    var row = createBeatRow(newBeat());
    if (beatsRoot.firstChild) {
      beatsRoot.insertBefore(row, beatsRoot.firstChild);
    } else {
      beatsRoot.appendChild(row);
    }
    var dateEl = row.querySelector(".beat-editor__date");
    if (dateEl) dateEl.focus();
  }

  if (btnAddBeat) {
    btnAddBeat.addEventListener("click", function () {
      prependNewBeatRow();
    });
  }

  if (btnAddBeatBottom) {
    btnAddBeatBottom.addEventListener("click", function () {
      appendNewBeatRow();
    });
  }

  if (formSave) {
    formSave.addEventListener("submit", function (e) {
      e.preventDefault();
      saveCurrentEditor();
    });
  }

  function applyQueryParams() {
    var params = new URLSearchParams(location.search);
    var py = params.get("year");
    if (py && yearSelect) {
      var yn = parseInt(py, 10);
      if (
        !isNaN(yn) &&
        data.years.some(function (x) {
          return x.year === yn;
        })
      ) {
        yearSelect.value = String(yn);
        lastYearValue = yearSelect.value;
      }
    }
  }

  populateYearOptions();
  applyQueryParams();
  if (yearSelect) lastYearValue = yearSelect.value;
  loadYearIntoForm();

  var qs = new URLSearchParams(location.search);
  if (qs.get("addBeat") === "1") {
    appendNewBeatRow();
  }
  var beatId = qs.get("beatId");
  if (beatId && beatsRoot) {
    requestAnimationFrame(function () {
      var rows = beatsRoot.querySelectorAll(".beat-editor");
      rows.forEach(function (row) {
        if (row.getAttribute("data-beat-id") === beatId) {
          row.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      });
    });
  }

  (function initEditorBackToTop() {
    var btn = document.getElementById("editor-backtop");
    if (!btn) return;
    var reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var thresholdPx = 200;
    function syncBackTopVisibility() {
      var show = window.scrollY > thresholdPx;
      btn.classList.toggle("is-visible", show);
      btn.setAttribute("aria-hidden", show ? "false" : "true");
    }
    btn.addEventListener("click", function () {
      window.scrollTo({
        top: 0,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    });
    window.addEventListener("scroll", syncBackTopVisibility, {
      passive: true,
    });
    window.addEventListener("resize", syncBackTopVisibility, {
      passive: true,
    });
    syncBackTopVisibility();
  })();

  (function initEditorBackToBottom() {
    var btn = document.getElementById("editor-backbottom");
    if (!btn) return;
    var reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var thresholdPx = 200;

    function atBottom() {
      var doc = document.documentElement;
      var maxY = Math.max(0, doc.scrollHeight - window.innerHeight);
      return window.scrollY >= maxY - 8;
    }

    function syncVisibility() {
      var show = window.scrollY > thresholdPx && !atBottom();
      btn.classList.toggle("is-visible", show);
      btn.setAttribute("aria-hidden", show ? "false" : "true");
    }

    btn.addEventListener("click", function () {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    });
    window.addEventListener("scroll", syncVisibility, { passive: true });
    window.addEventListener("resize", syncVisibility, { passive: true });
    syncVisibility();
  })();
  }

  ClubStorage.hydrateFromServer().finally(runEditor);
})();
