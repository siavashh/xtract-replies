(function () {
  let isLoading = false;
  let extracting = false;
  let dead = false;
  let observer = null;

  function isExtensionAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (error) {
      return false;
    }
  }

  function teardown() {
    if (dead) return;
    dead = true;
    isLoading = false;
    extracting = false;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    document.querySelectorAll(".xtract-replies-btn").forEach((btn) => {
      const wrap = btn.parentElement;
      if (wrap && wrap.querySelector(".xtract-replies-btn") === btn) {
        wrap.remove();
      } else {
        btn.remove();
      }
    });
  }

  function sendRuntimeMessage(payload) {
    if (!isExtensionAlive()) {
      teardown();
      return;
    }
    try {
      chrome.runtime.sendMessage(payload, () => {
        void chrome.runtime.lastError;
      });
    } catch (error) {
      teardown();
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isScrollDebugEnabled() {
    try {
      return localStorage.getItem("xtractDebugScroll") !== "0";
    } catch (error) {
      return true;
    }
  }

  function logScrollDebug(label, el, extra) {
    if (!isScrollDebugEnabled()) return;
    if (!el) {
      console.log(`[Xtract scroll] ${label}: null`, extra || "");
      return;
    }
    let overflowY = "";
    try {
      overflowY = getComputedStyle(el).overflowY;
    } catch (error) {
      overflowY = "unknown";
    }
    console.log(`[Xtract scroll] ${label}:`, {
      tag: el.tagName.toLowerCase(),
      className: String(el.className || ""),
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowY,
      canScroll: el.scrollHeight > el.clientHeight + 2,
      hasCommentList: !!el.querySelector(
        'ul._a9z6, ul._a9za, div.xsag5q8, a[href*="/c/"]'
      ),
      element: el,
      ...(extra || {}),
    });
  }

  function logScrollerCandidates() {
    if (!isScrollDebugEnabled()) return;
    getCommentsScrollerCandidates().forEach((el, index) => {
      logScrollDebug(`candidate [${index}] score=${scoreCommentsScroller(el)}`, el);
    });
    logScrollDebug("getCommentsScroller() picked", getCommentsScroller());
  }

  function installScrollDebugProbe() {
    if (window.__xtractScrollProbeInstalled) return;
    window.__xtractScrollProbeInstalled = true;

    document.addEventListener(
      "scroll",
      (event) => {
        if (!isScrollDebugEnabled()) return;
        const target = event.target;
        if (
          target === document ||
          target === document.documentElement ||
          target === document.body
        ) {
          return;
        }
        const key = String(target.className || target.tagName);
        const now = Date.now();
        window.__xtractScrollLogTimes ||= new Map();
        const last = window.__xtractScrollLogTimes.get(key) || 0;
        if (now - last < 400) return;
        window.__xtractScrollLogTimes.set(key, now);
        logScrollDebug("manual", target);
      },
      true
    );

    console.log(
      '[Xtract] scroll debug on — scroll the comments column and watch for "manual" logs. Disable: localStorage.setItem("xtractDebugScroll","0")'
    );
  }

  function getPostUrl() {
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical?.href && /\/(p|reel)\//.test(canonical.href)) {
      return canonical.href.split("?")[0];
    }
    const pathMatch =
      location.pathname.match(/\/[^/]+\/(p|reel)\/[^/]+/) ||
      location.pathname.match(/\/(p|reel)\/[^/]+/);
    if (pathMatch) {
      return `https://www.instagram.com${pathMatch[0]}/`;
    }
    const postLink = document.querySelector('a[href*="/p/"], a[href*="/reel/"]');
    if (postLink) {
      const href = postLink.getAttribute("href") || "";
      const path = href.split("?")[0];
      return path.startsWith("http")
        ? path
        : `https://www.instagram.com${path}`;
    }
    return location.href.split("?")[0];
  }

  function isProfileHref(href) {
    if (!href || href === "/" || href === "#") return false;
    const path = href.split("?")[0];
    return (
      /^\/[A-Za-z0-9._]+\/?$/.test(path) &&
      !path.includes("/p/") &&
      !path.includes("/reel") &&
      !path.includes("/reels/") &&
      !path.includes("/liked_by") &&
      !path.includes("/c/")
    );
  }

  function sectionHasLike(section) {
    return !!section?.querySelector('svg[aria-label="Like"]');
  }

  function reactionRowChild(section) {
    return Array.from(section.children).find(
      (el) =>
        el.tagName === "DIV" &&
        el.classList.contains("x78zum5") &&
        el.querySelector('svg[aria-label="Like"]')
    );
  }

  function scoreReactionSection(section) {
    if (!sectionHasLike(section)) return 0;
    let score = 1;
    if (section.querySelector('svg[aria-label="Save"]')) score += 4;
    if (section.querySelector('svg[aria-label="Comment"]')) score += 4;
    if (
      section.querySelector('svg[aria-label="Share"]') ||
      section.querySelector('svg[aria-label="Share Post"]')
    ) {
      score += 2;
    }
    if (section.querySelector('svg[aria-label="Repost"]')) score += 2;
    if (section.classList.contains("xrvj5dj")) score += 8;
    if (section.closest("div.x1xp8e9x, div.x10b6aqq")) score += 8;
    return score;
  }

  function findReactionSection() {
    let best = null;
    let bestScore = 0;
    document.querySelectorAll("section").forEach((section) => {
      const score = scoreReactionSection(section);
      if (score > bestScore) {
        bestScore = score;
        best = section;
      }
    });
    return best;
  }

  function findInjectionAnchor() {
    // Direct /p/ and /reel/ permalinks: div.x1xp8e9x wraps the action bar.
    const permalinkRoots = document.querySelectorAll(
      "div.x1xp8e9x, div.x10b6aqq"
    );
    for (const root of permalinkRoots) {
      const section = root.querySelector("section");
      if (!sectionHasLike(section)) continue;
      const host = reactionRowChild(section);
      if (host) return { section, host };
    }

    // Modal layout: the section itself is the flex reaction row.
    const modalSection = document.querySelector(
      "section.x78zum5 svg[aria-label='Like']"
    )?.closest("section");
    if (modalSection) {
      return { section: modalSection, host: modalSection };
    }

    const section = findReactionSection();
    if (!section) return null;
    return { section, host: findReactionHost(section) };
  }

  function findReactionHost(section) {
    const row = reactionRowChild(section);
    if (row) return row;
    if (section.classList.contains("x78zum5")) return section;
    return section;
  }

  function removeXtractButton(btn) {
    const wrap = btn.parentElement;
    if (
      wrap &&
      wrap !== document.body &&
      wrap.querySelectorAll(".xtract-replies-btn").length === 1
    ) {
      wrap.remove();
    } else {
      btn.remove();
    }
  }

  function pruneStrayButtons(keepHost) {
    document.querySelectorAll(".xtract-replies-btn").forEach((btn) => {
      if (keepHost && keepHost.contains(btn)) return;
      removeXtractButton(btn);
    });
  }

  function injectXtractButton() {
    if (dead || !isExtensionAlive()) {
      teardown();
      return;
    }
    const anchor = findInjectionAnchor();
    if (!anchor) {
      pruneStrayButtons(null);
      return;
    }
    const { host } = anchor;
    pruneStrayButtons(host);
    if (host.querySelector(".xtract-replies-btn")) return;

    const wrapper = document.createElement("span");
    wrapper.className = "x1rg5ohu";

    const btn = document.createElement("button");
    btn.className = "xtract-replies-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Xtract comments");
    btn.style.padding = "0";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.width = "34px";
    btn.style.height = "34px";
    btn.style.marginTop = "3px";
    btn.style.border = "none";
    btn.style.background = "none";
    btn.style.cursor = "pointer";
    btn.style.transition = "all 0.3s";
    btn.onmouseover = () => {
      btn.style.transform = "scale(1.1)";
    };
    btn.onmouseout = () => {
      btn.style.transform = "scale(1)";
    };

    const img = document.createElement("img");
    try {
      img.src = chrome.runtime.getURL("assets/48.png");
    } catch (error) {
      teardown();
      return;
    }
    img.style.width = "24px";
    img.style.height = "24px";
    btn.appendChild(img);
    btn.onclick = startExtraction;
    wrapper.appendChild(btn);
    host.appendChild(wrapper);
  }

  function extractTextAndEmojis(node) {
    let text = "";
    if (node.nodeType === Node.TEXT_NODE) {
      text = node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName.toLowerCase() === "br") {
        text = "\n";
      } else if (node.tagName.toLowerCase() === "img") {
        text = node.getAttribute("alt") || "";
      } else {
        node.childNodes.forEach((child) => {
          text += extractTextAndEmojis(child);
        });
      }
    }
    return text;
  }

  function parseCount(text) {
    const match = String(text || "").match(/([\d,]+)/);
    return match ? parseInt(match[1].replace(/,/g, ""), 10) || 0 : 0;
  }

  function getMainPostLikes() {
    const section = findReactionSection();
    if (section) {
      const likeSvg = section.querySelector('svg[aria-label="Like"]');
      if (likeSvg) {
        const likeHost =
          likeSvg.closest("span.x1qfufaz") ||
          likeSvg.closest('[role="button"]')?.parentElement;
        let sibling = likeHost?.nextElementSibling;
        while (sibling) {
          const text = (sibling.textContent || "").trim();
          if (/^[\d,.]+/.test(text)) return parseCount(text);
          if (sibling.querySelector('svg[aria-label="Repost"]')) break;
          sibling = sibling.nextElementSibling;
        }
      }
    }

    const candidates = document.querySelectorAll("section span[dir='auto']");
    for (const el of candidates) {
      const text = (el.textContent || "").trim();
      if (/\blikes\b/i.test(text)) return parseCount(text);
    }
    return 0;
  }

  function extractDirectPostCaption() {
    const authorLink = Array.from(
      document.querySelectorAll('a.notranslate._a6hd[href^="/"]')
    ).find((link) => isProfileHref(link.getAttribute("href")));
    if (!authorLink) return null;

    const handle =
      authorLink.querySelector("span._ap3a")?.textContent.trim() ||
      authorLink.textContent.trim();
    const timeEl =
      document.querySelector("time.xdwrcjd[datetime]") ||
      document.querySelector("time[datetime]");
    const textEl = document.querySelector("span.x126k92a");

    let text = "N/A";
    if (textEl) {
      let textContent = "";
      textEl.childNodes.forEach((node) => {
        textContent += extractTextAndEmojis(node);
      });
      text = textContent || textEl.textContent || "N/A";
    }

    return {
      handle,
      username: handle,
      text,
      timestamp: timeEl?.getAttribute("datetime") || "N/A",
      isRTL: ["fa", "ar", "he", "ur"].includes(textEl?.getAttribute("lang") || ""),
    };
  }

  function getCaptionBlock() {
    return document.querySelector("li._a9z5 div._a9zr");
  }

  function extractMainPost() {
    const postUrl = getPostUrl();
    const data = {
      postType: "Main Post",
      source: "instagram",
      username: "N/A",
      handle: "N/A",
      timestamp: "N/A",
      tweetUrl: postUrl,
      text: "N/A",
      likes: getMainPostLikes(),
      replies: 0,
      views: 0,
    };

    const captionBlock = getCaptionBlock();
    if (captionBlock) {
      const handleLink = captionBlock.querySelector(
        'a[href^="/"][role="link"]'
      );
      if (handleLink) {
        data.handle = handleLink.textContent.trim();
        data.username = data.handle;
      }
      const textEl =
        captionBlock.querySelector("h1._ap3a") ||
        captionBlock.querySelector("span._ap3a");
      if (textEl) {
        let textContent = "";
        textEl.childNodes.forEach((node) => {
          textContent += extractTextAndEmojis(node);
        });
        data.text = textContent || textEl.textContent || "N/A";
        const lang = textEl.getAttribute("lang") || "";
        const rtlLanguages = ["fa", "ar", "he", "ur"];
        data.isRTL = rtlLanguages.includes(lang);
      }
    } else {
      const captionArea = document.querySelector("div._aaqy");
      if (captionArea) {
        const handleLink = captionArea.querySelector(
          'a[href^="/"][role="link"]'
        );
        if (handleLink) {
          data.handle = handleLink.textContent.trim();
          data.username = data.handle;
        }
        const textBlock = captionArea.querySelector("div._aaqt");
        if (textBlock) {
          data.text = (textBlock.textContent || "N/A").trim();
        }
      } else {
        const directCaption = extractDirectPostCaption();
        if (directCaption) {
          Object.assign(data, directCaption);
        }
      }
    }

    if (data.timestamp === "N/A") {
      const headerTime = document.querySelector("time[datetime]");
      if (headerTime) {
        data.timestamp = headerTime.getAttribute("datetime") || "N/A";
      }
    }

    data.likes = getMainPostLikes();

    return data;
  }

  function isCaptionComment(li) {
    return li.classList.contains("_a9z5");
  }

  function isViewRepliesPlaceholder(li) {
    return li.classList.contains("_a9yg");
  }

  function getCommentElements() {
    return Array.from(document.querySelectorAll("li._a9zj._a9zl")).filter(
      (li) => !isCaptionComment(li) && !isViewRepliesPlaceholder(li)
    );
  }

  function getCommentMetaBlocks() {
    return Array.from(document.querySelectorAll("div._a9zr")).filter((meta) => {
      if (meta.closest("li._a9z5")) return false;
      return !!meta.querySelector('a[href*="/c/"] time[datetime]');
    });
  }

  function isModalCommentLayout() {
    return getCommentMetaBlocks().some((meta) =>
      meta.closest("li._a9zj._a9zl")
    );
  }

  function isScrollableElement(el) {
    if (!el || el === document.body || el === document.documentElement) {
      return false;
    }
    const style = getComputedStyle(el);
    if (/(auto|scroll|overlay)/.test(style.overflowY)) return true;
    return el.scrollHeight > el.clientHeight + 2;
  }

  function scrollOverflow(el) {
    if (!el) return 0;
    return Math.max(0, el.scrollHeight - el.clientHeight);
  }

  function containsComments(el) {
    return !!el?.querySelector(
      'ul._a9z6, ul._a9za, div.xsag5q8, div._a9zr, a[href*="/c/"] time[datetime]'
    );
  }

  function getModalCommentsScroller() {
    const list = document.querySelector("ul._a9z6, ul._a9za");
    if (!list) return null;
    const column = list.closest("div.x5wqa0o");
    if (column && containsComments(column)) return column;
    return null;
  }

  function scoreCommentsScroller(el) {
    if (!el || el.getAttribute("role") === "dialog") return -1;
    if (!containsComments(el)) return -1;
    const overflow = scrollOverflow(el);
    if (!isScrollableElement(el) && overflow <= 2) return -1;

    let score = overflow;
    if (el.classList.contains("x5wqa0o")) {
      score += 2_000_000;
    } else if (
      el.classList.contains("x5yr21d") &&
      el.classList.contains("xw2csxc") &&
      el.classList.contains("x1odjw0f")
    ) {
      score += 1_000_000;
    } else if (
      el.classList.contains("xw2csxc") &&
      el.classList.contains("x1odjw0f")
    ) {
      score += 500_000;
    }
    if (el.querySelector("ul._a9z6, ul._a9za") && !el.classList.contains("x5wqa0o")) {
      score -= 750_000;
    }
    return score;
  }

  function getCommentsScrollerCandidates() {
    const candidates = new Set();
    const list = document.querySelector("ul._a9z6, ul._a9za");
    if (list) {
      let el = list.parentElement;
      while (el && el !== document.body && el !== document.documentElement) {
        candidates.add(el);
        el = el.parentElement;
      }
    }

    const commentAnchor =
      getCommentMetaBlocks()[0] ||
      document
        .querySelector('a[href*="/c/"] time[datetime]')
        ?.closest('a[href*="/c/"]');
    if (commentAnchor) {
      let el = commentAnchor.parentElement;
      while (el && el !== document.body && el !== document.documentElement) {
        candidates.add(el);
        el = el.parentElement;
      }
    }

    for (const selector of [
      "div.x5wqa0o",
      "div.x5yr21d.xw2csxc.x1odjw0f",
      "div.xw2csxc.x1odjw0f",
      "div.x9f619.x5yr21d.xv54qhq.x10l6tqk",
      "div.x1odjw0f.xv54qhq.xf7dkkf",
      "div.x10l6tqk.xv54qhq",
    ]) {
      document.querySelectorAll(selector).forEach((el) => candidates.add(el));
    }

    return Array.from(candidates);
  }

  function getCommentsScroller() {
    const modalScroller = getModalCommentsScroller();
    if (modalScroller) return modalScroller;

    let best = null;
    let bestScore = -1;
    for (const el of getCommentsScrollerCandidates()) {
      const score = scoreCommentsScroller(el);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function scrollWithinContainer(element, container) {
    if (!element || !container) return false;
    const elRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const prevTop = container.scrollTop;
    if (elRect.bottom > containerRect.bottom - 8) {
      container.scrollTop += elRect.bottom - containerRect.bottom + 48;
    }
    if (elRect.top < containerRect.top + 8) {
      container.scrollTop -= containerRect.top - elRect.top + 48;
    }
    return container.scrollTop !== prevTop;
  }

  async function scrollCommentsList() {
    const scroller = getCommentsScroller();
    if (!scroller) {
      logScrollDebug("scrollCommentsList", null, { reason: "no scroller found" });
      await sleep(1500);
      return false;
    }
    const prevHeight = scroller.scrollHeight;
    const prevTop = scroller.scrollTop;
    const step = Math.max(Math.floor(scroller.clientHeight * 0.85), 300);

    logScrollDebug("scrollCommentsList before", scroller, { step });

    const anchor =
      findLoadMoreButton() ||
      getPermalinkCommentBlocks().at(-1)?.querySelector('a[href*="/c/"]') ||
      getCommentMetaBlocks().at(-1) ||
      scroller.querySelector('a[href*="/c/"]');
    if (anchor) scrollWithinContainer(anchor, scroller);

    const nearBottom =
      scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 8;
    if (nearBottom) {
      scroller.scrollTop = scroller.scrollHeight;
    } else {
      scroller.scrollTop = Math.min(
        scroller.scrollTop + step,
        scroller.scrollHeight
      );
    }
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));

    logScrollDebug("scrollCommentsList after", scroller, {
      prevTop,
      prevHeight,
      moved: scroller.scrollTop > prevTop + 1,
      grew: scroller.scrollHeight > prevHeight + 2,
    });

    await sleep(1500);
    return (
      scroller.scrollHeight > prevHeight + 2 ||
      scroller.scrollTop > prevTop + 1
    );
  }

  function isViewRepliesText(text) {
    return /view (all )?\d+ repl/i.test(String(text || "").trim());
  }

  function isHideRepliesText(text) {
    return /hide (all )?repl/i.test(String(text || "").trim());
  }

  function isUiChromeText(text) {
    const value = String(text || "").trim();
    return (
      /^(Reply|See translation|Edited)$/i.test(value) ||
      isViewRepliesText(value) ||
      isHideRepliesText(value)
    );
  }

  function isUsernameHeaderSpan(span, handle) {
    if (!span) return true;
    if (span.closest('a[href*="/c/"]')) return true;
    if (span.querySelector("time[datetime]")) return true;
    if (span.closest(".xt0psk2") && !span.closest("div.xcy8zhl")) return true;
    const candidate = extractTextFromSpan(span);
    if (!candidate) return true;
    if (candidate === handle) return true;
    return false;
  }

  function extractPermalinkCommentText(block, handle) {
    if (!block) return "N/A";

    const bodyDiv = block.querySelector("div.xcy8zhl");
    if (bodyDiv) {
      for (const span of bodyDiv.querySelectorAll('span[dir="auto"]')) {
        const candidate = extractTextFromSpan(span);
        if (!candidate || isUiChromeText(candidate)) continue;
        return candidate;
      }
    }

    for (const span of block.querySelectorAll('span[dir="auto"]')) {
      if (isUsernameHeaderSpan(span, handle)) continue;
      const candidate = extractTextFromSpan(span);
      if (!candidate || candidate === handle) continue;
      if (isUiChromeText(candidate)) continue;
      if (/\blikes?\b/i.test(candidate)) continue;
      return candidate;
    }

    return "N/A";
  }

  function extractReplyToHandle(block, authorHandle) {
    const bodyDiv = block.querySelector("div.xcy8zhl");
    const scope = bodyDiv || block;
    const mention = scope.querySelector(
      'a.notranslate._a6hd[href^="/"], a._a6hd[href^="/"]'
    );
    if (!mention) return "";

    const href = mention.getAttribute("href") || "";
    if (!isProfileHref(href)) return "";

    const mentioned =
      mention.textContent.trim().replace(/^@/, "") ||
      href.replace(/^\//, "").replace(/\/$/, "");
    if (!mentioned || mentioned === authorHandle) return "";
    return mentioned;
  }

  function isPermalinkNestedReply(block) {
    if (!block) return false;
    if (block.closest("div.xpdvgm7")) return true;
    if (block.closest("ul._a9ym")) return true;
    const threadList = block.closest("ul");
    if (threadList && threadList.closest("div.xpdvgm7")) return true;
    return false;
  }

  function normalizeCommentUrl(href) {
    if (!href) return "";
    const path = String(href).split("?")[0];
    return path.startsWith("http")
      ? path
      : `https://www.instagram.com${path}`;
  }

  function findParentCommentUrl(el) {
    if (!el) return "";

    const nestedList =
      el.closest("ul._a9ym") ||
      (el.closest("div.xpdvgm7") ? el.closest("ul") : null);
    if (!nestedList) return "";

    const parentLi = nestedList.closest("li._a9zj._a9zl");
    if (parentLi) {
      const myLi = el.closest("li._a9zj._a9zl");
      if (myLi && myLi !== parentLi) {
        const link = parentLi.querySelector('a[href*="/c/"]');
        if (link) return normalizeCommentUrl(link.getAttribute("href"));
      }
    }

    const threadRoot = nestedList.closest("div.xpdvgm7")?.parentElement;
    if (threadRoot) {
      for (const time of threadRoot.querySelectorAll(
        'a[href*="/c/"] time[datetime]'
      )) {
        const link = time.closest('a[href*="/c/"]');
        if (!link || nestedList.contains(link)) continue;
        return normalizeCommentUrl(link.getAttribute("href"));
      }
    }

    return "";
  }

  function getIncludeNestedRepliesPreference() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get({ igIncludeNestedReplies: false }, (items) => {
          resolve(!!items.igIncludeNestedReplies);
        });
      } catch (error) {
        resolve(false);
      }
    });
  }

  function shouldCollectComment(data, includeNestedReplies) {
    if (!data) return false;
    if (includeNestedReplies) return true;
    return data.postType !== "Reply";
  }

  function extractTextFromSpan(span) {
    let textContent = "";
    span.childNodes.forEach((node) => {
      textContent += extractTextAndEmojis(node);
    });
    return (textContent || span.textContent || "").trim();
  }

  function isPermalinkCaptionBlock(block) {
    const avatarWrap = block.querySelector(
      ":scope > .x1xegmmw, :scope > div.x1xegmmw"
    );
    return (
      !!avatarWrap &&
      !block.querySelector('a[href*="/c/"] time[datetime]')
    );
  }

  function extractPermalinkComment(commentLink) {
    const timeEl = commentLink.querySelector("time[datetime]");
    if (!timeEl) return null;

    const block =
      commentLink.closest("div.xsag5q8") ||
      commentLink.closest("div._a9zr") ||
      commentLink.closest('div[class*="xsag5q8"]') ||
      commentLink.closest("div.x1uhb9sk")?.parentElement;
    if (!block || isPermalinkCaptionBlock(block)) return null;

    const href = commentLink.getAttribute("href") || "";
    const commentUrl = href.startsWith("http")
      ? href.split("?")[0]
      : `https://www.instagram.com${href.split("?")[0]}`;

    const handleLink =
      block.querySelector('a.notranslate._a6hd[href^="/"]') ||
      block.querySelector('a._a6hd[href^="/"][role="link"]');
    const handle =
      handleLink?.querySelector("span._ap3a")?.textContent.trim() ||
      handleLink?.textContent.trim() ||
      "N/A";

    const text = extractPermalinkCommentText(block, handle);
    const textEl =
      block.querySelector("div.xcy8zhl span[dir='auto']") ||
      block.querySelector('span[dir="auto"]');

    let likes = 0;
    block.querySelectorAll("span.xuxw1ft, span.x193iq5w").forEach((span) => {
      if (/\blikes?\b/i.test(span.textContent || "")) {
        likes = parseCount(span.textContent);
      }
    });

    let nestedReplies = 0;
    block.parentElement
      ?.querySelectorAll('[role="button"] span[dir="auto"], span[dir="auto"]')
      .forEach((el) => {
        if (!isViewRepliesText(el.textContent)) return;
        const match = (el.textContent || "").match(/(\d+)/);
        if (match) nestedReplies = parseInt(match[1], 10) || 0;
      });

    const lang = textEl?.getAttribute("lang") || "";
    const rtlLanguages = ["fa", "ar", "he", "ur"];
    const isReply = isPermalinkNestedReply(block);
    const replyToHandle = isReply ? extractReplyToHandle(block, handle) : "";
    const parentCommentUrl = isReply ? findParentCommentUrl(block) : "";

    return {
      postType: isReply ? "Reply" : "Comment",
      source: "instagram",
      username: handle,
      handle,
      timestamp: timeEl.getAttribute("datetime") || "N/A",
      tweetUrl: commentUrl,
      text,
      likes,
      replies: nestedReplies,
      views: 0,
      replyToHandle,
      parentCommentUrl,
      isRTL: rtlLanguages.includes(lang),
    };
  }

  function getPermalinkCommentLinks() {
    return Array.from(document.querySelectorAll('a[href*="/c/"]')).filter(
      (link) => link.querySelector("time[datetime]")
    );
  }

  function getPermalinkCommentBlocks() {
    return Array.from(document.querySelectorAll("div.xsag5q8")).filter(
      (block) => {
        if (isPermalinkCaptionBlock(block)) return false;
        return !!block.querySelector('a[href*="/c/"] time[datetime]');
      }
    );
  }

  function permalinkCommentCount() {
    return getPermalinkCommentLinks().length;
  }

  function collectComments(seenKeys, collected, includeNestedReplies = false) {
    const metaBlocks = getCommentMetaBlocks();
    if (metaBlocks.length > 0) {
      metaBlocks.forEach((meta) => {
        const li = meta.closest("li._a9zj._a9zl");
        const nested = li
          ? !!li.closest("ul._a9ym")
          : !!meta.closest("ul._a9ym, div.xpdvgm7");
        const data = extractCommentFromMeta(meta, nested);
        if (!shouldCollectComment(data, includeNestedReplies)) return;
        const key = commentKey(data);
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        collected.push(data);
      });
      return;
    }

    if (isModalCommentLayout()) {
      getCommentElements().forEach((li) => {
        const nested = !!li.closest("ul._a9ym");
        const data = extractModalCommentData(li, nested);
        if (!shouldCollectComment(data, includeNestedReplies)) return;
        const key = commentKey(data);
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        collected.push(data);
      });
      return;
    }

    const permalinkBlocks = getPermalinkCommentBlocks();
    const permalinkLinks =
      permalinkBlocks.length > 0
        ? permalinkBlocks
            .map((block) =>
              block
                .querySelector('a[href*="/c/"] time[datetime]')
                ?.closest('a[href*="/c/"]')
            )
            .filter(Boolean)
        : getPermalinkCommentLinks();

    permalinkLinks.forEach((link) => {
      const data = extractPermalinkComment(link);
      if (!shouldCollectComment(data, includeNestedReplies)) return;
      const key = commentKey(data);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      collected.push(data);
    });
  }

  function commentCount() {
    const metaCount = getCommentMetaBlocks().length;
    if (metaCount > 0) return metaCount;
    if (isModalCommentLayout()) {
      return getCommentElements().length;
    }
    const blockCount = getPermalinkCommentBlocks().length;
    if (blockCount > 0) return blockCount;
    return permalinkCommentCount();
  }

  function extractCommentFromMeta(meta, isReply = false) {
    if (!meta) return null;

    const handleLink =
      meta.querySelector('a[href^="/"][role="link"]') ||
      meta.querySelector("h3 a[href^='/'], h2 a[href^='/']");
    const handle = handleLink ? handleLink.textContent.trim() : "N/A";

    const textEl =
      meta.querySelector("span._ap3a") || meta.querySelector("h1._ap3a");
    let text = "N/A";
    if (textEl) {
      let textContent = "";
      textEl.childNodes.forEach((node) => {
        textContent += extractTextAndEmojis(node);
      });
      text = textContent || textEl.textContent || "N/A";
    } else {
      text = extractPermalinkCommentText(meta, handle);
    }

    const timeEl = meta.querySelector("time[datetime]");
    const timestamp = timeEl
      ? timeEl.getAttribute("datetime") || "N/A"
      : "N/A";

    const commentLink = meta.querySelector('a[href*="/c/"]');
    let commentUrl = "N/A";
    if (commentLink) {
      const href = commentLink.getAttribute("href") || "";
      commentUrl = href.startsWith("http")
        ? href.split("?")[0]
        : `https://www.instagram.com${href.split("?")[0]}`;
    }

    let likes = 0;
    meta.querySelectorAll("button._a9ze span").forEach((span) => {
      if (/\blikes?\b/i.test(span.textContent || "")) {
        likes = parseCount(span.textContent);
      }
    });

    let nestedReplies = 0;
    const commentRoot = meta.closest("li._a9zj._a9zl") || meta.parentElement;
    const viewReplies =
      commentRoot?.querySelector("span._a9yi") ||
      Array.from(
        commentRoot?.querySelectorAll('[role="button"] span, span[dir="auto"]') ||
          []
      ).find((el) => isViewRepliesText(el.textContent));
    if (viewReplies) {
      const match = (viewReplies.textContent || "").match(/(\d+)/);
      if (match) nestedReplies = parseInt(match[1], 10) || 0;
    }

    const lang = textEl?.getAttribute("lang") || "";
    const rtlLanguages = ["fa", "ar", "he", "ur"];
    const replyToHandle = isReply ? extractReplyToHandle(meta, handle) : "";
    const parentCommentUrl = isReply ? findParentCommentUrl(meta) : "";

    return {
      postType: isReply ? "Reply" : "Comment",
      source: "instagram",
      username: handle,
      handle,
      timestamp,
      tweetUrl: commentUrl,
      text,
      likes,
      replies: nestedReplies,
      views: 0,
      replyToHandle,
      parentCommentUrl,
      isRTL: rtlLanguages.includes(lang),
    };
  }

  function extractModalCommentData(li, isReply = false) {
    return extractCommentFromMeta(li.querySelector("div._a9zr"), isReply);
  }

  function commentKey(data) {
    if (data.tweetUrl && data.tweetUrl !== "N/A") return data.tweetUrl;
    return `${data.handle}|${data.timestamp}|${data.text.slice(0, 80)}`;
  }

  function findLoadMoreButton() {
    return document
      .querySelector('svg[aria-label="Load more comments"]')
      ?.closest("button");
  }

  function hasViewRepliesControls() {
    return Array.from(
      document.querySelectorAll("span._a9yi, [role='button'] span, span[dir='auto']")
    ).some((el) => isViewRepliesText(el.textContent));
  }

  function hasLoadingComments() {
    return !!document.querySelector(
      '[role="progressbar"] svg[aria-label="Loading..."], svg[aria-label="Loading..."]'
    );
  }

  function hasPendingCommentLoads() {
    return (
      findLoadMoreButton() ||
      hasViewRepliesControls() ||
      hasLoadingComments()
    );
  }

  async function expandViewReplies() {
    const labels = Array.from(
      document.querySelectorAll("span._a9yi, [role='button'] span, span[dir='auto']")
    ).filter((el) => isViewRepliesText(el.textContent));

    let clicked = false;
    for (const label of labels) {
      const btn =
        label.closest("button") || label.closest('[role="button"]');
      if (!btn || btn.disabled) continue;
      btn.click();
      clicked = true;
      await sleep(1200);
    }
    return clicked;
  }

  async function clickLoadMoreComments() {
    const btn = findLoadMoreButton();
    if (!btn) return false;
    const scroller = getCommentsScroller();
    if (scroller) scrollWithinContainer(btn, scroller);
    btn.click();
    await sleep(1500);
    if (scroller) {
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    }
    return true;
  }

  try {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "stopLoading") {
        isLoading = false;
        sendResponse({ status: "stopped" });
        return true;
      }
    });
  } catch (error) {
    teardown();
  }

  async function startExtraction() {
    if (extracting || dead) return;
    if (!isExtensionAlive()) {
      teardown();
      return;
    }
    extracting = true;
    isLoading = true;

    try {
      const includeNestedReplies = await getIncludeNestedRepliesPreference();
      const mainPost = extractMainPost();
      const seenKeys = new Set();
      let collected = [];
      let stagnantRounds = 0;
      let loadAttempts = 0;
      const maxLoadAttempts = 300;
      const maxStagnantRounds = 8;

      collectComments(seenKeys, collected, includeNestedReplies);

      logScrollerCandidates();

      sendRuntimeMessage({ action: "openPopup" });
      sendRuntimeMessage({
        action: "sendReplies",
        replies: collected,
        mainTweet: mainPost,
        status: "loading",
      });

      while (
        isLoading &&
        !dead &&
        loadAttempts < maxLoadAttempts &&
        stagnantRounds < maxStagnantRounds
      ) {
        if (!isExtensionAlive()) {
          teardown();
          break;
        }

        const previousSeenSize = seenKeys.size;

        collectComments(seenKeys, collected, includeNestedReplies);

        sendRuntimeMessage({
          action: "sendReplies",
          replies: collected,
          mainTweet: mainPost,
          status: "loading",
        });

        if (includeNestedReplies) {
          await expandViewReplies();
        }
        if (!isLoading) break;

        collectComments(seenKeys, collected, includeNestedReplies);

        sendRuntimeMessage({
          action: "sendReplies",
          replies: collected,
          mainTweet: mainPost,
          status: "loading",
        });

        if (findLoadMoreButton()) {
          await clickLoadMoreComments();
        }
        await scrollCommentsList();
        loadAttempts++;

        collectComments(seenKeys, collected, includeNestedReplies);

        sendRuntimeMessage({
          action: "sendReplies",
          replies: collected,
          mainTweet: mainPost,
          status: "loading",
        });

        const gainedComments = seenKeys.size > previousSeenSize;
        if (gainedComments) {
          stagnantRounds = 0;
        } else if (hasLoadingComments()) {
          stagnantRounds = 0;
          await sleep(1000);
        } else {
          stagnantRounds++;
        }
        if (!isLoading) break;
      }

      if (dead) return;

      mainPost.replies = collected.length;

      if (!isLoading) {
        sendRuntimeMessage({
          action: "sendReplies",
          replies: collected,
          mainTweet: mainPost,
          status: "stopped",
        });
        return;
      }

      sendRuntimeMessage({
        action: "sendReplies",
        replies: collected,
        mainTweet: mainPost,
        status: "complete",
      });
    } catch (error) {
      if (!dead && isExtensionAlive()) {
        sendRuntimeMessage({
          action: "sendReplies",
          replies: [],
          mainTweet: {},
          status: "error",
        });
      } else {
        teardown();
      }
    } finally {
      extracting = false;
    }
  }

  function watchRouteChanges() {
    let lastPath = location.pathname;
    const check = () => {
      if (location.pathname === lastPath) return;
      lastPath = location.pathname;
      injectXtractButton();
    };
    window.addEventListener("popstate", check);
    const { pushState, replaceState } = history;
    history.pushState = function (...args) {
      pushState.apply(this, args);
      check();
    };
    history.replaceState = function (...args) {
      replaceState.apply(this, args);
      check();
    };
  }

  observer = new MutationObserver(() => {
    injectXtractButton();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  installScrollDebugProbe();
  watchRouteChanges();
  injectXtractButton();
})();
