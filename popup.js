let allReplies = [];
let mainTweet = {};
let cachedExportBaseName = null;

function exportHandleToken(value) {
  return (
    String(value || "unknown")
      .replace(/^@/, "")
      .toLowerCase()
      .replace(/--+/g, "")
      .replace(/[^\w.-]/g, "")
      .slice(0, 50) || "unknown"
  );
}

function platformSlug(source) {
  return source === "instagram" ? "ig" : "x";
}

function computeExportBaseName() {
  const source = mainTweet.source || allReplies[0]?.source || "x";
  const platform = platformSlug(source);
  const handle = exportHandleToken(mainTweet.handle || mainTweet.username);
  const now = new Date();
  const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const hhmm = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  return `Xtract-${platform}--${handle}--${mmdd}-${hhmm}`;
}

function buildExportFileName() {
  if (!cachedExportBaseName) {
    cachedExportBaseName = computeExportBaseName();
  }
  return cachedExportBaseName;
}

// Function to convert timestamp to human-readable format
function convertDate(timestamp) {
  if (!timestamp || timestamp === "N/A") return { short: "N/A", full: "N/A" };
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return { short: "N/A", full: "N/A" };

    // Full version for the title (includes AM/PM)
    const full = date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    });

    // Short version for display (excludes AM/PM)
    const short = date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: false, // 24-hour format, effectively removes AM/PM
    });

    return { short, full };
  } catch (error) {
    return { short: "N/A", full: "N/A" };
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeXUrl(url) {
  if (!url || url === "N/A" || url === "#") return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return "";
    if (
      parsed.hostname === "x.com" ||
      parsed.hostname === "twitter.com" ||
      parsed.hostname === "www.instagram.com" ||
      parsed.hostname === "instagram.com"
    ) {
      return parsed.href;
    }
  } catch (error) {}
  return "";
}

function safeHandle(handle, source) {
  const value = String(handle || "").replace(/^@/, "");
  if (source === "instagram") {
    return /^[A-Za-z0-9._]{1,30}$/.test(value) ? value : "";
  }
  return /^[A-Za-z0-9_]{1,15}$/.test(value) ? value : "";
}

function profileUrl(handle, source) {
  const safe = safeHandle(handle, source);
  if (!safe) return "";
  if (source === "instagram") {
    return `https://www.instagram.com/${safe}/`;
  }
  return `https://x.com/${safe}`;
}

function itemsNoun(source, plural = true) {
  if (source === "instagram") return plural ? "comments" : "comment";
  return plural ? "replies" : "reply";
}

function replyLabel(reply, source) {
  if (source !== "instagram") return "Reply";
  if (reply.postType === "Reply") return "Nested reply";
  return "Comment";
}

function normalizeUrlKey(url) {
  return String(url || "")
    .trim()
    .toLowerCase()
    .replace(/\/$/, "");
}

function orderInstagramCommentsThreaded(replies) {
  const hasNested = replies.some((r) => r.postType === "Reply");
  if (!hasNested) return replies;

  const tops = [];
  const childrenByParentUrl = new Map();
  const childrenByHandle = new Map();
  const looseNested = [];

  replies.forEach((reply, index) => {
    const item = { ...reply, _origIndex: index };
    if (reply.postType === "Reply") {
      const parentKey = normalizeUrlKey(reply.parentCommentUrl);
      if (parentKey && parentKey !== "n/a") {
        if (!childrenByParentUrl.has(parentKey)) {
          childrenByParentUrl.set(parentKey, []);
        }
        childrenByParentUrl.get(parentKey).push(item);
        return;
      }
      if (reply.replyToHandle) {
        const handleKey = String(reply.replyToHandle).toLowerCase();
        if (!childrenByHandle.has(handleKey)) {
          childrenByHandle.set(handleKey, []);
        }
        childrenByHandle.get(handleKey).push(item);
        return;
      }
      looseNested.push(item);
    } else {
      tops.push(item);
    }
  });

  const used = new Set();
  const result = [];

  function appendChildren(parent) {
    const urlKey = normalizeUrlKey(parent.tweetUrl);
    let kids = childrenByParentUrl.get(urlKey) || [];
    if (!kids.length && parent.handle) {
      kids = childrenByHandle.get(String(parent.handle).toLowerCase()) || [];
    }
    kids.sort((a, b) => {
      const ta = Date.parse(a.timestamp) || a._origIndex;
      const tb = Date.parse(b.timestamp) || b._origIndex;
      return ta - tb;
    });
    for (const kid of kids) {
      if (used.has(kid._origIndex)) continue;
      used.add(kid._origIndex);
      result.push(kid);
    }
  }

  for (const parent of tops) {
    result.push(parent);
    appendChildren(parent);
  }

  const leftovers = [...looseNested];
  for (const kids of childrenByParentUrl.values()) leftovers.push(...kids);
  for (const kids of childrenByHandle.values()) leftovers.push(...kids);
  leftovers.sort((a, b) => a._origIndex - b._origIndex);
  for (const kid of leftovers) {
    if (used.has(kid._origIndex)) continue;
    used.add(kid._origIndex);
    result.push(kid);
  }

  return result.map(({ _origIndex, ...rest }) => rest);
}

function displayReplies(replies, source) {
  if (source === "instagram") {
    return orderInstagramCommentsThreaded(replies);
  }
  return replies;
}

const IG_NESTED_STORAGE_KEY = "igIncludeNestedReplies";

function bindIgNestedCheckbox(id) {
  const input = document.getElementById(id);
  if (!input) return;

  chrome.storage.sync.get({ [IG_NESTED_STORAGE_KEY]: false }, (items) => {
    input.checked = !!items[IG_NESTED_STORAGE_KEY];
  });

  input.addEventListener("change", () => {
    chrome.storage.sync.set({ [IG_NESTED_STORAGE_KEY]: input.checked });
    const twinId =
      id === "igIncludeNestedRepliesIdle"
        ? "igIncludeNestedRepliesActive"
        : "igIncludeNestedRepliesIdle";
    const twin = document.getElementById(twinId);
    if (twin) twin.checked = input.checked;
  });
}

bindIgNestedCheckbox("igIncludeNestedRepliesIdle");
bindIgNestedCheckbox("igIncludeNestedRepliesActive");

function getSource(request) {
  if (request?.mainTweet?.source) return request.mainTweet.source;
  const first = (request?.replies || [])[0];
  return first?.source || "x";
}

function csvCell(value) {
  let str = String(value ?? "");
  if (/^[=+\-@]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
}

function notifyBadgeClear() {
  chrome.runtime.sendMessage({ action: "clearBadge" }, () => {
    void chrome.runtime.lastError;
  });
}

function applyState(request) {
  if (!request) return;
  const idleView = document.getElementById("idleView");
  const activeView = document.getElementById("activeView");
  const statusDiv = document.getElementById("status");
  const spinner = document.getElementById("spinner");
  const repliesDiv = document.getElementById("replies");
  const downloadCsvBtn = document.getElementById("downloadCsvBtn");
  const downloadHtmlBtn = document.getElementById("downloadHtmlBtn");
  const stopBtn = document.getElementById("stopGrabbingData");
  const replies = request.replies || [];
  const status = request.status || "idle";
  const source = getSource(request);
  const noun = itemsNoun(source);
  const showIdle = status === "idle" && replies.length === 0;

  idleView.classList.toggle("hidden", !showIdle);
  activeView.classList.toggle("hidden", showIdle);
  spinner.classList.toggle("hidden", status !== "loading");

  if (status === "idle") {
    statusDiv.textContent = "Ready";
    downloadCsvBtn.disabled = true;
    downloadHtmlBtn.disabled = true;
    stopBtn.disabled = true;
  } else if (status === "loading") {
    cachedExportBaseName = null;
    statusDiv.textContent = `Loading ${noun}… ${replies.length} found`;
    downloadCsvBtn.disabled = true;
    downloadHtmlBtn.disabled = true;
    stopBtn.disabled = false;
  } else if (status === "complete" || status === "stopped") {
    statusDiv.textContent =
      status === "complete"
        ? `Found ${replies.length} ${noun}`
        : `Stopped. Found ${replies.length} ${noun}`;
    downloadCsvBtn.disabled = replies.length === 0;
    downloadHtmlBtn.disabled = replies.length === 0;
    stopBtn.disabled = true;
  } else if (status === "error") {
    statusDiv.textContent = `Error loading ${noun}.`;
    downloadCsvBtn.disabled = true;
    downloadHtmlBtn.disabled = true;
    stopBtn.disabled = true;
  }

  allReplies = replies;
  mainTweet = request.mainTweet || {};
  const visibleReplies = displayReplies(allReplies, source);
  if (showIdle) {
    repliesDiv.innerHTML = "";
    return;
  }

  repliesDiv.innerHTML = visibleReplies
    .map((reply, index) => {
      const label = replyLabel(reply, source);
      const url = safeXUrl(reply.tweetUrl);
      const urlLabel = escapeHtml(reply.tweetUrl || "N/A");
      const replyToLine =
        reply.postType === "Reply" && reply.replyToHandle
          ? `<p><strong>Reply to:</strong> @${escapeHtml(reply.replyToHandle)}</p>`
          : "";
      const nestedStyle =
        reply.postType === "Reply"
          ? ' style="margin-left: 14px; border-left: 3px solid rgba(42, 157, 143, 0.25); padding-left: 10px;"'
          : "";
      return `<div class="reply"${nestedStyle}>
            <p><strong>${label} ${index + 1}</strong></p>
            <p><strong>User:</strong> ${escapeHtml(
              reply.username || "N/A",
            )} <span style="color: var(--muted-text);">@${escapeHtml(
              reply.handle || "N/A",
            )}</span></p>
            ${replyToLine}
            <p><strong>Timestamp:</strong> ${escapeHtml(
              convertDate(reply.timestamp).full,
            )}</p>
            <p><strong>URL:</strong> ${
              url
                ? `<a href="${escapeHtml(url)}" target="_blank">${urlLabel}</a>`
                : "N/A"
            }</p>
            <p><strong>Text:</strong> ${escapeHtml(reply.text || "N/A")}</p>
            <p><strong>Likes:</strong> ${escapeHtml(reply.likes || 0)}</p>
            <p><strong>Replies:</strong> ${escapeHtml(reply.replies || 0)}</p>
            <p><strong>Views:</strong> ${escapeHtml(reply.views || 0)}</p>
          </div>`;
    })
    .join("");
}

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "updatePopup" || request.action === "sendReplies") {
    applyState(request);
  }
});

chrome.runtime.sendMessage({ action: "getExtractionState" }, (state) => {
  if (chrome.runtime.lastError) return;
  applyState(state);
});

// Click handler for the stopGrabbingData button
document.getElementById("stopGrabbingData").addEventListener("click", () => {
  const noun = itemsNoun(mainTweet.source || allReplies[0]?.source || "x");
  chrome.runtime.sendMessage({ action: "stopLoading" }, (response) => {
    if (response && response.status === "stopped") {
      document.getElementById("stopGrabbingData").disabled = true;
      document.getElementById("status").textContent =
        `Stopped. Found ${allReplies.length} ${noun}`;
      document.getElementById("downloadCsvBtn").disabled = false;
      document.getElementById("downloadHtmlBtn").disabled = false;
    } else {
      document.getElementById("stopGrabbingData").disabled = true;
      document.getElementById("status").textContent =
        allReplies.length > 0
          ? `Error stopping. Found ${allReplies.length} ${noun}`
          : `Error stopping. No ${noun} found.`;
      document.getElementById("downloadCsvBtn").disabled =
        allReplies.length === 0;
      document.getElementById("downloadHtmlBtn").disabled =
        allReplies.length === 0;
    }
  });
});

const currentYear = new Date().getFullYear();
const copyrightText = `© ${currentYear} <a href="https://miraxle.com/projects/xtract-replies" target="_blank" rel="noopener noreferrer">Miraxle</a> · Xtract Replies · Built with <svg class="heart-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20.25S4.75 15.3 4.75 9.9A4.4 4.4 0 0 1 9.2 5.45c1.35 0 2.55.6 3.3 1.55.2-.25.45-.48.73-.68" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.5 6.32A4.35 4.35 0 0 1 15.7 5.45a4.4 4.4 0 0 1 4.45 4.45c0 2.55-1.65 4.95-4.05 7.15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.85 8.35c-.55.15-1.05.55-1.35 1.15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> for X lovers · <a href="https://x.com/siavashh" target="_blank" rel="noopener noreferrer">@siavashh</a>`;

const ICON_SORT_VERTICAL = `<svg class="sort-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.5 5.5v13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M5.8 15.2 8.5 18l2.7-2.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.5 18.5V5.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M12.8 8.8 15.5 6l2.7 2.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_SORT_ASC = `<svg class="sort-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 7h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M4.5 12h7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M4.5 17h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M18.5 18.5V6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M15.8 8.7 18.5 6l2.7 2.7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_SORT_DESC = `<svg class="sort-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 7h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M4.5 12h7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M4.5 17h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M18.5 5.5V18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M15.8 15.3 18.5 18l2.7-2.7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function sortIconFor(state) {
  if (state === "asc") return ICON_SORT_ASC;
  if (state === "desc") return ICON_SORT_DESC;
  return ICON_SORT_VERTICAL;
}

// Download CSV
document.getElementById("downloadCsvBtn").addEventListener("click", () => {
  const footer =
    "Miraxle,Xtract Replies,,https://miraxle.com,Built with love for X lovers | https://x.com/siavashh";
  const exportSource = mainTweet.source || allReplies[0]?.source || "x";
  const exportRows = displayReplies(allReplies, exportSource);
  const csvContent = [
    "username,handle,timestamp,tweetUrl,text,likes,replies,views",
    ...exportRows.map((reply) => {
      return [
        csvCell(reply.username || "N/A"),
        csvCell(reply.handle || "N/A"),
        csvCell(convertDate(reply.timestamp).full),
        csvCell(reply.tweetUrl || "N/A"),
        csvCell(reply.text || "N/A"),
        csvCell(reply.likes || 0),
        csvCell(reply.replies || 0),
        csvCell(reply.views || 0),
      ].join(",");
    }),
    "",
    `${footer}`,
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${buildExportFileName()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  notifyBadgeClear();
});

// Download HTML
document.getElementById("downloadHtmlBtn").addEventListener("click", () => {
  const exportSource = mainTweet.source || allReplies[0]?.source || "x";
  const exportNoun = itemsNoun(exportSource);
  const postNoun = exportSource === "instagram" ? "post" : "tweet";
  const exportRows = displayReplies(allReplies, exportSource);
  const nestedCount = allReplies.filter((r) => r.postType === "Reply").length;
  const showNestedControls = exportSource === "instagram" && nestedCount > 0;

  chrome.storage.sync.get({ igIncludeNestedReplies: false }, (items) => {
    const nestedCheckedDefault = showNestedControls
      ? !!items.igIncludeNestedReplies
      : false;
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Xtract Replies</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        :root {
            --primary: #2a9d8f;
            --primary-deep: #197669;
            --primary-soft: #d8efeb;
            --link-hover: #4fdbca;
            --secondary: #e9c369;
            --muted: #afd3ce;
            --muted-text: #5f7a76;
            --background: #f4faf8;
            --surface: rgba(255, 255, 255, 0.82);
            --table-light: #f3faf8;
            --table-dark: #e4f1ee;
            --table-spam: #f7f0df;
            --text-color: #16332f;
            --danger: #e04552;
            --shadow: 0 10px 30px rgba(25, 118, 105, 0.12);
            --grad-brand: linear-gradient(135deg, #2a9d8f 0%, #197669 100%);
        }
        * { box-sizing: border-box; }
        body {
          font-family: "Vazirmatn", "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif;
          font-optical-sizing: auto;
          margin: 0;
          padding: 32px 20px 48px;
          color: var(--text-color);
          background:
            radial-gradient(ellipse 120% 80% at 10% -10%, rgba(42, 157, 143, 0.22), transparent 55%),
            radial-gradient(ellipse 90% 70% at 110% 10%, rgba(25, 118, 105, 0.18), transparent 50%),
            radial-gradient(ellipse 80% 60% at 50% 120%, rgba(233, 195, 105, 0.16), transparent 45%),
            var(--background);
        }
        .page {
          max-width: 1200px;
          margin: 0 auto;
        }
        .brand-lockup {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin: 0 0 8px;
        }
        .brand-lockup .logo-wrap {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          background: var(--grad-brand);
          box-shadow: var(--shadow), 0 0 0 5px rgba(42, 157, 143, 0.12);
          flex-shrink: 0;
        }
        .brand-lockup .logo-wrap svg {
          width: 26px;
          height: 28px;
        }
        .brand-lockup .logo-wrap .cls-1,
        .brand-lockup .logo-wrap .cls-2 {
          fill: #fff;
        }
        h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 700;
          letter-spacing: -0.03em;
          background: var(--grad-brand);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .main-tweet {
          max-width: 720px;
          margin: 24px auto;
          padding: 18px 20px;
          background: var(--surface);
          border: 1px solid rgba(42, 157, 143, 0.14);
          border-radius: 18px;
          box-shadow: var(--shadow);
          backdrop-filter: blur(10px);
          transition: transform 0.25s ease, box-shadow 0.25s ease;
          cursor: pointer;
        }
        .main-tweet:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 34px rgba(25, 118, 105, 0.16);
        }
        .main-tweet .user {
          font-weight: 650;
          margin-bottom: 6px;
        }
        .main-tweet .user .handle {
          color: var(--muted-text);
          font-weight: 500;
        }
        .main-tweet .text {
          margin: 12px 0;
          word-break: break-word;
          width: 100%;
          line-height: 1.5;
        }
        .main-tweet .text-rtl { direction: rtl; text-align: right; }
        .main-tweet .text-ltr { direction: ltr; text-align: left; }
        .main-tweet .stats {
          display: flex;
          gap: 18px;
          color: var(--muted-text);
          font-weight: 600;
        }
        .main-tweet .stats span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .main-tweet .stats svg {
          width: 18px;
          height: 18px;
          color: var(--primary-deep);
        }
        .summary {
          text-align: center;
          margin: 18px auto;
          max-width: 820px;
          color: var(--muted-text);
          font-size: 14px;
          line-height: 1.55;
        }
        .summary a {
          color: var(--primary-deep);
          text-decoration: underline;
          font-weight: 600;
        }
        .tip {
          text-align: center;
          margin: 0 auto 14px;
          font-size: 12px;
          color: var(--muted-text);
        }
        .table-controls {
          max-width: 1200px;
          margin: 0 auto 12px;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
          background: var(--surface);
          border: 1px solid rgba(42, 157, 143, 0.14);
          border-radius: 12px;
          font-size: 13px;
          color: var(--text-color);
          user-select: none;
        }
        .table-controls label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-weight: 600;
        }
        .table-controls input {
          width: 15px;
          height: 15px;
          accent-color: var(--primary-deep);
          cursor: pointer;
        }
        .table-controls .hint {
          color: var(--muted-text);
          font-size: 12px;
          font-weight: 500;
        }
        tr.nested-reply.nested-hidden {
          display: none;
        }
        table {
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          border-collapse: separate;
          border-spacing: 0;
          table-layout: fixed;
          background: rgba(255, 255, 255, 0.88);
          border: 1px solid rgba(42, 157, 143, 0.14);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: var(--shadow);
          backdrop-filter: blur(8px);
        }
        thead tr{
            background: var(--grad-brand);
        }
        th, td {
          padding: 12px 14px;
          text-align: left;
          border-bottom: 1px solid rgba(42, 157, 143, 0.1);
          vertical-align: middle;
        }
        th {
          color: white;
          font-weight: 650;
          font-size: 13px;
        }
        th.sortable {
          cursor: pointer;
          user-select: none;
        }
        th.sortable:hover {
          filter: brightness(1.06);
        }
        th .th-inner {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 8px;
          min-height: 24px;
          line-height: 1;
          width: 100%;
          white-space: nowrap;
        }
        th.likes .th-inner,
        th.replies .th-inner,
        th.views .th-inner,
        th.tweetUrl .th-inner {
          justify-content: center;
        }
        th .col-icon {
          width: 18px;
          height: 18px;
          display: block;
          flex-shrink: 0;
        }
        th.sortable .sort-icon {
          width: 20px;
          height: 20px;
          display: block;
          flex-shrink: 0;
          opacity: 0.9;
        }
        th.sortable.asc .sort-icon,
        th.sortable.desc .sort-icon {
          opacity: 1;
        }
        tbody tr:nth-child(even) {
          background-color: var(--table-light);
        }
        tbody tr:hover {
          background-color: var(--table-dark);
        }
        tr.spam {
          background-color: var(--table-spam);
        }
        tr.nested-reply td.user {
          padding-left: 22px;
          border-left: 3px solid rgba(42, 157, 143, 0.22);
        }
        .reply-to {
          display: block;
          font-size: 0.75em;
          color: var(--muted-text);
          margin-bottom: 3px;
          font-weight: 600;
        }
        tbody tr:last-child td {
          border-bottom: none;
        }
        td {
          word-break: break-word;
        }
        .user { width: 16%; }
        td.user { font-size: 0.85em; }
        .user .handle { color: var(--muted-text); }
        .timestamp { width: 13%; }
        td.timestamp { font-size: 0.78em; color: var(--muted-text); }
        .text { width: auto; }
        .text-rtl { direction: rtl; text-align: right; }
        .text-ltr { direction: ltr; text-align: left; }
        .likes, .replies, .views {
          text-align: center;
          width: 78px;
          font-variant-numeric: tabular-nums;
        }
        .tweetUrl {
          width: 56px;
          text-align: center;
        }
        .tweetUrl button {
          background: var(--primary-soft);
          border: none;
          cursor: pointer;
          padding: 7px;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--primary-deep);
          transition: transform 0.15s ease, background 0.15s ease;
        }
        .tweetUrl button:hover {
          background: var(--grad-brand);
          color: #fff;
          transform: translateY(-1px);
        }
        .tweetUrl svg {
          width: 15px;
          height: 15px;
        }
        a {
          color: var(--primary-deep);
          text-decoration: none;
        }
        a:hover {
          text-decoration: underline;
          color: var(--link-hover);
        }
        .copyright-footer {
          max-width: 1200px;
          margin: 28px auto 0;
          text-align: center;
          color: var(--muted-text);
          font-size: 13px;
        }
        .copyright-footer p { margin: 0; }
        .copyright-footer a {
          color: var(--primary-deep);
          text-decoration: none;
          font-weight: 650;
        }
        .copyright-footer a:hover {
          text-decoration: underline;
        }
        .heart-icon {
          display: inline-block;
          width: 22px;
          height: 22px;
          vertical-align: -5px;
          margin: 0 4px;
          color: #197669;
        }
      </style>
    </head>
    <body>
      <div class="page">
      <div class="brand-lockup">
        <div class="logo-wrap">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 304.88 323.42" aria-hidden="true">
            <polygon class="cls-2" points="188.22 136.95 185.28 140.33 173.64 153.87 173.58 153.79 173.57 153.79 173.64 153.9 278.13 303.35 235.25 303.35 149.98 181.4 149.98 181.39 149.93 181.34 149.97 181.39 135.82 197.83 135.82 197.83 135.83 197.85 222.11 323.42 295.46 323.42 304.88 306.72 188.22 136.95" />
            <polygon class="cls-2" points="299.65 7.42 295.46 0 278.12 0 175.82 118.91 188.22 136.94 299.65 7.42" />
            <polygon class="cls-1" points="188.22 136.95 94.17 .07 0 .07 123.55 179.88 .14 323.32 27.89 323.32 188.22 136.95" />
          </svg>
        </div>
        <h1>Xtract Replies</h1>
      </div>
      ${
        mainTweet.username
          ? `
        <div class="main-tweet" ${
          safeXUrl(mainTweet.tweetUrl)
            ? `onclick="window.open('${escapeHtml(
                safeXUrl(mainTweet.tweetUrl),
              )}', '_blank')"`
            : ""
        } style="cursor: pointer;">
        <div class="user">
          ${escapeHtml(mainTweet.username || "N/A")} <span class="handle">${
            safeHandle(mainTweet.handle, exportSource)
              ? `<a href="${escapeHtml(
                  profileUrl(mainTweet.handle, exportSource),
                )}" onclick="event.stopPropagation();">@${escapeHtml(
                  mainTweet.handle,
                )}</a>`
              : `@${escapeHtml(mainTweet.handle || "N/A")}`
          }</span>
        </div>
        <div class="text ${mainTweet.isRTL ? "text-rtl" : "text-ltr"}">${escapeHtml(
          mainTweet.text || "N/A",
        )}</div>
        <div class="stats">
          <span>
            <svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <g>
                <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path>
              </g>
            </svg>
            ${escapeHtml(mainTweet.likes || 0)}
          </span>
          <span>
            <svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <g>
                <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"></path>
              </g>
            </svg>
            ${escapeHtml(mainTweet.replies || 0)}
          </span>
          <span>
            <svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <g>
                <path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"></path>
              </g>
            </svg>
            ${escapeHtml(mainTweet.views || 0)}
          </span>
        </div>
      </div>
      `
          : ""
      }
      <div class="summary">
        This ${postNoun} by ${escapeHtml(mainTweet.username || "N/A")} (<a href="${escapeHtml(
          safeXUrl(mainTweet.tweetUrl) || "#",
        )}" target="_blank">@${escapeHtml(mainTweet.handle || "N/A")}</a>)
        has a total of ${escapeHtml(mainTweet.replies || 0)} ${exportNoun}. ${
          allReplies.length
        } ${exportNoun} extracted (<span id="visibleCount">${
          nestedCheckedDefault
            ? allReplies.length
            : allReplies.length - nestedCount
        }</span> shown). It has received ${escapeHtml(
          mainTweet.likes || 0,
        )} likes${exportSource === "instagram" ? "." : ` and ${escapeHtml(mainTweet.views || 0)} views.`}
      </div>
      ${
        showNestedControls
          ? `<div class="table-controls" id="nestedReplyControls">
        <label for="showNestedReplies">
          <input type="checkbox" id="showNestedReplies"${
            nestedCheckedDefault ? " checked" : ""
          }>
          Show nested replies (${nestedCount})
        </label>
        <span class="hint">Top-level comments only when off.</span>
      </div>`
          : ""
      }
      <p class="tip">${
        exportSource === "instagram"
          ? showNestedControls
            ? "Comments are grouped by thread. Use the checkbox above or click a column header to sort flat."
            : "Comments are grouped by thread (replies sit under their parent). Click a column header to sort flat."
          : "Tip: click a column header to sort."
      }</p>
      <table id="repliesTable">
        <thead>
          <tr>
            <th class="user sortable" data-sort="user" data-type="string"><span class="th-inner">User ${sortIconFor()}</span></th>
            <th class="timestamp sortable" data-sort="timestamp" data-type="date"><span class="th-inner">Time ${sortIconFor()}</span></th>
            <th class="text sortable" data-sort="text" data-type="string"><span class="th-inner">Text ${sortIconFor()}</span></th>
            <th class="likes sortable" data-sort="likes" data-type="number" title="Likes"><span class="th-inner"><svg class="col-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path></svg>${sortIconFor()}</span></th>
            <th class="replies sortable" data-sort="replies" data-type="number" title="Replies"><span class="th-inner"><svg class="col-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"></path></svg>${sortIconFor()}</span></th>
            <th class="views sortable" data-sort="views" data-type="number" title="Views"><span class="th-inner"><svg class="col-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"></path></svg>${sortIconFor()}</span></th>
            <th class="tweetUrl"></th>
          </tr>
        </thead>
        <tbody>
          ${exportRows
            .map((reply) => {
              const replyUrl = safeXUrl(reply.tweetUrl);
              const handle = safeHandle(reply.handle, exportSource);
              const ts =
                reply.timestamp && reply.timestamp !== "N/A"
                  ? reply.timestamp
                  : "";
              const likes = Number(reply.likes) || 0;
              const repliesCount = Number(reply.replies) || 0;
              const views = Number(reply.views) || 0;
              const isNested = reply.postType === "Reply";
              const replyToHint =
                isNested && reply.replyToHandle
                  ? `<span class="reply-to">↳ @${escapeHtml(reply.replyToHandle)}</span>`
                  : "";
              return `
                <tr class="${
                  !reply.timestamp || reply.timestamp === "N/A" ? "spam" : ""
                }${isNested ? " nested-reply" : ""}${
                  isNested && !nestedCheckedDefault ? " nested-hidden" : ""
                }" data-post-type="${escapeHtml(reply.postType || "Comment")}">
                  <td class="user" data-value="${escapeHtml(
                    (reply.username || "") + " " + (reply.handle || ""),
                  )}">
                    ${replyToHint}
                    ${escapeHtml(reply.username || "N/A")} <span class="handle">${
                      handle
                        ? `<a href="${escapeHtml(
                            profileUrl(reply.handle, exportSource),
                          )}">@${escapeHtml(reply.handle)}</a>`
                        : `@${escapeHtml(reply.handle || "N/A")}`
                    }</span>
                  </td>
                  <td class="timestamp" data-value="${escapeHtml(ts)}" title="${escapeHtml(
                    ts ? convertDate(reply.timestamp).full : "N/A",
                  )}">${escapeHtml(
                    ts ? convertDate(reply.timestamp).short : "N/A",
                  )}</td>
                  <td class="text ${
                    reply.isRTL ? "text-rtl" : "text-ltr"
                  }" data-value="${escapeHtml(reply.text || "")}">${escapeHtml(
                    reply.text || "N/A",
                  )}</td>
                  <td class="likes" data-value="${likes}">${likes}</td>
                  <td class="replies" data-value="${repliesCount}">${repliesCount}</td>
                  <td class="views" data-value="${views}">${views}</td>
                  <td class="tweetUrl">
                    ${
                      replyUrl
                        ? `<button onclick="window.open('${escapeHtml(
                            replyUrl,
                          )}', '_blank')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7h3a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5v0a5 5 0 0 1 5-5h3m0 5h6" /></svg>
                          </button>`
                        : `<span title="AD"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 11V12C21 17.4903 16.761 20.1547 14.1014 21.286C13.38 21.5929 13.0193 21.7464 12 21.7464C10.9807 21.7464 10.62 21.5929 9.89856 21.286C7.23896 20.1547 3 17.4903 3 12V6.71888C3 4.52896 3 3.434 3.70725 2.83487C4.4145 2.23574 5.49553 2.41591 7.6576 2.77626L8.71202 2.95199C10.3523 3.22537 11.1724 3.36205 12 3.36205C12.8276 3.36205 13.6477 3.22537 15.288 2.95199L16.3424 2.77626C18.5045 2.41591 19.5855 2.23574 20.2927 2.83487C21 3.434 21 4.52896 21 6.71888V7" stroke="#e63946" stroke-width="1.5" stroke-linecap="round"/><path d="M6.5 9C6.79112 8.4174 7.57665 8 8.5 8C9.42335 8 10.2089 8.4174 10.5 9" stroke="#e63946" stroke-width="1.5" stroke-linecap="round"/><path d="M13.5 9C13.7911 8.4174 14.5766 8 15.5 8C16.4234 8 17.2089 8.4174 17.5 9" stroke="#e63946" stroke-width="1.5" stroke-linecap="round"/><path d="M8.5 15C8.5 15 9.55 14 12 14C14.45 14 15.5 15 15.5 15" stroke="#e63946" stroke-width="1.5" stroke-linecap="round"/></svg></span>`
                    }
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
      
      <footer class="copyright-footer">
        <p>
          ${copyrightText}
        </p>
      </footer>
      </div>
      <script>
        (function () {
          var table = document.getElementById("repliesTable");
          if (!table) return;
          var tbody = table.tBodies[0];
          var headers = table.querySelectorAll("th.sortable");
          var nestedToggle = document.getElementById("showNestedReplies");
          var visibleCountEl = document.getElementById("visibleCount");
          var currentKey = null;
          var asc = true;
          var ICON_SORT_VERTICAL = ${JSON.stringify(ICON_SORT_VERTICAL)};
          var ICON_SORT_ASC = ${JSON.stringify(ICON_SORT_ASC)};
          var ICON_SORT_DESC = ${JSON.stringify(ICON_SORT_DESC)};

          function countVisibleRows() {
            var count = 0;
            Array.prototype.forEach.call(tbody.rows, function (row) {
              if (row.classList.contains("nested-hidden")) return;
              count += 1;
            });
            return count;
          }

          function applyNestedVisibility() {
            if (!nestedToggle) return;
            var show = nestedToggle.checked;
            Array.prototype.forEach.call(tbody.rows, function (row) {
              if (!row.classList.contains("nested-reply")) return;
              row.classList.toggle("nested-hidden", !show);
            });
            if (visibleCountEl) {
              visibleCountEl.textContent = String(countVisibleRows());
            }
          }

          if (nestedToggle) {
            nestedToggle.addEventListener("change", applyNestedVisibility);
            applyNestedVisibility();
          }

          function setSortIcon(th, state) {
            var inner = th.querySelector(".th-inner") || th;
            var icon = inner.querySelector(".sort-icon");
            var html =
              state === "asc"
                ? ICON_SORT_ASC
                : state === "desc"
                  ? ICON_SORT_DESC
                  : ICON_SORT_VERTICAL;
            if (icon) icon.outerHTML = html;
            else inner.insertAdjacentHTML("beforeend", html);
          }

          function cellValue(row, key, type) {
            var cell = row.querySelector("td." + key);
            if (!cell) return "";
            var raw = cell.getAttribute("data-value");
            if (raw == null) raw = cell.textContent || "";
            if (type === "number") return Number(raw) || 0;
            if (type === "date") {
              var t = Date.parse(raw);
              return isNaN(t) ? 0 : t;
            }
            return String(raw).toLowerCase();
          }

          headers.forEach(function (th) {
            th.addEventListener("click", function () {
              var key = th.getAttribute("data-sort");
              var type = th.getAttribute("data-type") || "string";
              if (currentKey === key) asc = !asc;
              else {
                currentKey = key;
                asc = type === "number" || type === "date" ? false : true;
              }
              headers.forEach(function (h) {
                h.classList.remove("asc", "desc");
                setSortIcon(h, null);
              });
              th.classList.add(asc ? "asc" : "desc");
              setSortIcon(th, asc ? "asc" : "desc");
              var rows = Array.prototype.slice.call(tbody.rows);
              rows.sort(function (a, b) {
                var av = cellValue(a, key, type);
                var bv = cellValue(b, key, type);
                if (av < bv) return asc ? -1 : 1;
                if (av > bv) return asc ? 1 : -1;
                return 0;
              });
              rows.forEach(function (row) {
                tbody.appendChild(row);
              });
            });
          });
        })();
      </script>
    </body>
    </html>
  `;

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${buildExportFileName()}.html`;
    link.click();
    URL.revokeObjectURL(link.href);
    notifyBadgeClear();
  });
});
