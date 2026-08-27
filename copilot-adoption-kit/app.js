(function () {
  "use strict";

  var navToggle = document.querySelector(".nav-toggle");
  var resourceNav = document.getElementById("resource-nav");

  if (navToggle && resourceNav) {
    navToggle.addEventListener("click", function () {
      var open = navToggle.getAttribute("aria-expanded") === "true";
      navToggle.setAttribute("aria-expanded", String(!open));
      resourceNav.classList.toggle("is-open", !open);
    });

    resourceNav.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        navToggle.setAttribute("aria-expanded", "false");
        resourceNav.classList.remove("is-open");
      }
    });
  }

  var phaseTabs = Array.prototype.slice.call(document.querySelectorAll("[data-phase]"));
  var phasePanels = Array.prototype.slice.call(document.querySelectorAll("[data-panel]"));

  function activatePhase(index, moveFocus) {
    phaseTabs.forEach(function (tab, tabIndex) {
      var selected = tabIndex === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && moveFocus) tab.focus();
    });

    phasePanels.forEach(function (panel, panelIndex) {
      panel.hidden = panelIndex !== index;
    });
  }

  phaseTabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () { activatePhase(index, false); });
    tab.addEventListener("keydown", function (event) {
      var next = index;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % phaseTabs.length;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + phaseTabs.length) % phaseTabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = phaseTabs.length - 1;
      if (next !== index) {
        event.preventDefault();
        activatePhase(next, true);
      }
    });
  });

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var field = "";
    var quoted = false;

    for (var i = 0; i < text.length; i += 1) {
      var char = text[i];
      var next = text[i + 1];

      if (char === '"' && quoted && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") i += 1;
        row.push(field);
        if (row.some(function (value) { return value !== ""; })) rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }

    if (field || row.length) {
      row.push(field);
      rows.push(row);
    }

    var headers = rows.shift() || [];
    return rows.map(function (values) {
      var item = {};
      headers.forEach(function (header, index) { item[header] = values[index] || ""; });
      return item;
    });
  }

  var promptGrid = document.getElementById("prompt-grid");
  var promptStatus = document.getElementById("prompt-status");
  var promptSearch = document.getElementById("prompt-search");
  var departmentFilter = document.getElementById("department-filter");
  var appFilter = document.getElementById("app-filter");
  var promptControls = document.getElementById("prompt-controls");
  var promptReset = document.getElementById("prompt-reset");
  var loadMore = document.getElementById("load-more");
  var heroPromptCount = document.getElementById("hero-prompt-count");
  var prompts = [];
  var visibleLimit = 6;

  function uniqueValues(key) {
    return Array.from(new Set(prompts.map(function (item) { return item[key]; }).filter(Boolean))).sort();
  }

  function addOptions(select, values) {
    values.forEach(function (value) {
      var option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  function normalized(value) {
    return String(value || "").toLowerCase().trim();
  }

  function copyText(text, button) {
    function showCopied() {
      var original = button.textContent;
      button.textContent = "Copied";
      window.setTimeout(function () { button.textContent = original; }, 1500);
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(showCopied).catch(function () {});
      return;
    }

    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand("copy"); showCopied(); } catch (error) {}
    document.body.removeChild(textarea);
  }

  function createMeta(text) {
    var span = document.createElement("span");
    span.textContent = text;
    return span;
  }

  function createPromptCard(item) {
    var card = document.createElement("article");
    card.className = "prompt-card";

    var meta = document.createElement("div");
    meta.className = "prompt-meta";
    meta.appendChild(createMeta(item.Department));
    meta.appendChild(createMeta(item.App));
    meta.appendChild(createMeta(item.Level));
    meta.appendChild(createMeta((item["Est. Time Saved (min)"] || "—") + " min est."));

    var heading = document.createElement("h3");
    heading.textContent = item.Task;

    var prompt = document.createElement("p");
    prompt.className = "prompt-text";
    prompt.textContent = item.Prompt;

    var copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy-prompt";
    copy.textContent = "Copy prompt";
    copy.setAttribute("aria-label", "Copy prompt: " + item.Task);
    copy.addEventListener("click", function () { copyText(item.Prompt, copy); });

    card.appendChild(meta);
    card.appendChild(heading);
    card.appendChild(prompt);
    card.appendChild(copy);
    return card;
  }

  function filteredPrompts() {
    var query = normalized(promptSearch && promptSearch.value);
    var department = departmentFilter ? departmentFilter.value : "";
    var app = appFilter ? appFilter.value : "";

    return prompts.filter(function (item) {
      var searchable = normalized([item.Department, item.Task, item.Prompt, item.App, item.Level].join(" "));
      return (!query || searchable.indexOf(query) !== -1) &&
        (!department || item.Department === department) &&
        (!app || item.App === app);
    });
  }

  function renderPrompts() {
    if (!promptGrid || !promptStatus) return;
    var filtered = filteredPrompts();
    var visible = filtered.slice(0, visibleLimit);
    promptGrid.replaceChildren();

    if (!visible.length) {
      var empty = document.createElement("p");
      empty.className = "prompt-empty";
      empty.textContent = "No prompts match those filters. Try a broader task or reset the library.";
      promptGrid.appendChild(empty);
    } else {
      visible.forEach(function (item) { promptGrid.appendChild(createPromptCard(item)); });
    }

    promptStatus.textContent = filtered.length + " prompt" + (filtered.length === 1 ? "" : "s") + " found" + (filtered.length > visible.length ? " · showing " + visible.length : "");
    if (loadMore) {
      loadMore.hidden = filtered.length <= visible.length;
      loadMore.textContent = "Show more prompts (" + (filtered.length - visible.length) + ")";
    }
  }

  if (promptGrid) {
    fetch(promptGrid.getAttribute("data-source") || "data/prompt-gallery.csv")
      .then(function (response) {
        if (!response.ok) throw new Error("Prompt library could not be loaded.");
        return response.text();
      })
      .then(function (text) {
        prompts = parseCsv(text);
        addOptions(departmentFilter, uniqueValues("Department"));
        addOptions(appFilter, uniqueValues("App"));
        if (heroPromptCount) heroPromptCount.innerHTML = prompts.length + " <small>prompts</small>";
        renderPrompts();
      })
      .catch(function () {
        promptStatus.textContent = "Prompt library unavailable. Open the source CSV to browse all prompts.";
        promptGrid.innerHTML = '<p class="prompt-empty">The library could not be loaded in this preview.</p>';
      });
  }

  if (promptSearch) promptSearch.addEventListener("input", function () { visibleLimit = 6; renderPrompts(); });
  if (departmentFilter) departmentFilter.addEventListener("change", function () { visibleLimit = 6; renderPrompts(); });
  if (appFilter) appFilter.addEventListener("change", function () { visibleLimit = 6; renderPrompts(); });
  if (promptControls) promptControls.addEventListener("reset", function () { window.setTimeout(function () { visibleLimit = 6; renderPrompts(); }, 0); });
  if (promptReset) promptReset.addEventListener("click", function () { promptSearch && promptSearch.focus(); });
  if (loadMore) loadMore.addEventListener("click", function () { visibleLimit += 6; renderPrompts(); });

  var governanceChecklist = document.getElementById("governance-checklist");
  var governanceCount = document.getElementById("governance-count");
  var governanceProgress = document.getElementById("governance-progress");
  var governanceReset = document.getElementById("governance-reset");

  function updateGovernance() {
    if (!governanceChecklist) return;
    var checks = Array.prototype.slice.call(governanceChecklist.querySelectorAll('input[type="checkbox"]'));
    var completed = checks.filter(function (check) { return check.checked; }).length;
    if (governanceCount) governanceCount.textContent = completed;
    if (governanceProgress) governanceProgress.style.width = (completed / checks.length * 100) + "%";
  }

  if (governanceChecklist) governanceChecklist.addEventListener("change", updateGovernance);
  if (governanceReset) governanceReset.addEventListener("click", function () {
    governanceChecklist.querySelectorAll('input[type="checkbox"]').forEach(function (check) { check.checked = false; });
    updateGovernance();
  });

  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.resource-nav a[href^="#"]'));
  if ("IntersectionObserver" in window && navLinks.length) {
    var sections = navLinks.map(function (link) { return document.querySelector(link.getAttribute("href")); }).filter(Boolean);
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (link) {
          link.classList.toggle("is-active", link.getAttribute("href") === "#" + entry.target.id);
        });
      });
    }, { rootMargin: "-20% 0px -70% 0px", threshold: 0 });
    sections.forEach(function (section) { observer.observe(section); });
  }
})();
