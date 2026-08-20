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

  // Utility to wait for an element to appear
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const interval = 100;
      let elapsed = 0;
      const check = () => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        elapsed += interval;
        if (elapsed >= timeout) return reject("Element not found: " + selector);
        setTimeout(check, interval);
      };
      check();
    });
  }

  // Find Grok button for the main post only
  function getMainPost() {
    return document.querySelector('article[role="article"]');
  }

  // Only the top-right tweet chrome (Grok / More). Never [role="group"] —
  // that is the bottom engagement bar and caused a duplicate button.
  function findInjectAnchor() {
    const mainPost = getMainPost();
    if (!mainPost) return null;
    const grokBtn = mainPost.querySelector('button[aria-label="Grok actions"]');
    if (grokBtn && grokBtn.parentElement) return grokBtn.parentElement;
    const moreBtn =
      mainPost.querySelector('button[aria-label="More"]') ||
      mainPost.querySelector('[data-testid="caret"]');
    if (moreBtn && moreBtn.parentElement) return moreBtn.parentElement;
    return null;
  }

  function removeXtractButton(btn) {
    const wrap = btn.parentElement;
    if (wrap && wrap !== document.body && wrap.querySelectorAll(".xtract-replies-btn").length === 1) {
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

  // Inject our button next to Grok (or More menu if Grok is missing)
  function injectXtractButton() {
    if (dead || !isExtensionAlive()) {
      teardown();
      return;
    }
    const anchor = findInjectAnchor();
    if (!anchor || !anchor.parentElement) {
      pruneStrayButtons(null);
      return;
    }
    const host = anchor.parentElement;
    pruneStrayButtons(host);
    if (host.querySelector(".xtract-replies-btn")) return;
    const wrapper = document.createElement("div");
    wrapper.className = anchor.className;
    const btn = document.createElement("button");
    btn.className = "xtract-replies-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Xtract replies");
    btn.style.padding = "0";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.width = "34px";
    btn.style.height = "34px";
    btn.style.border = "none";
    btn.style.background = "none";
    btn.style.cursor = "pointer";
    // hover
    btn.style.transition = "all 0.3s";
    btn.onmouseover = () => {
      btn.style.transform = "scale(1.1)";
    };
    btn.onmouseout = () => {
      btn.style.backgroundColor = "transparent";
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
    host.insertBefore(wrapper, anchor.nextSibling);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getScroller() {
    return document.scrollingElement || document.documentElement;
  }

  function articleCount() {
    return document.querySelectorAll('article[role="article"]').length;
  }

  // X.com scrolls the window, not primaryColumn. Measuring that column's
  // scrollHeight and calling scrollIntoView never loads the next replies.
  async function scrollToLoadMore(previousCount) {
    const scroller = getScroller();
    const prevHeight = scroller.scrollHeight;
    scroller.scrollTo(0, scroller.scrollHeight);
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(2000);
    return (
      scroller.scrollHeight > prevHeight || articleCount() > previousCount
    );
  }

  // Extract reply data
  function extractReplyData(replyElement, isMainTweet = false) {
    const tweetData = {};

    // Set reply type as Main Tweet or Reply
    tweetData.postType = isMainTweet ? "Main Tweet" : "Reply";

    // Extract username
    const usernameElement = replyElement.querySelector(
      '[data-testid="User-Name"] a div[dir="ltr"] span'
    );
    if (usernameElement) {
      tweetData.username = usernameElement.textContent.trim();
    } else {
      tweetData.username = "N/A";
    }

    // Extract timestamp and tweet URL
    const timeLinkElement = replyElement.querySelector('a[role="link"] time');
    if (timeLinkElement) {
      tweetData.timestamp = timeLinkElement.getAttribute("datetime") || "N/A";
      const linkElement = timeLinkElement.parentElement;
      const href = linkElement.getAttribute("href");
      tweetData.tweetUrl = href ? `https://x.com${href}` : "N/A";
    } else {
      tweetData.timestamp = "N/A";
      tweetData.tweetUrl = "N/A";
    }

    // Extract handle from tweetUrl (primary method)
    if (tweetData.tweetUrl && tweetData.tweetUrl !== "N/A") {
      try {
        const url = new URL(tweetData.tweetUrl);
        const pathSegments = url.pathname.split("/");
        const handleIndex = pathSegments.indexOf("status") - 1;
        if (handleIndex >= 0 && pathSegments[handleIndex]) {
          tweetData.handle = pathSegments[handleIndex];
        }
      } catch (error) {}
    }

    // Fallback: Extract handle from [data-testid="User-Name"] link
    if (!tweetData.handle || tweetData.handle === "N/A") {
      const handleElement = replyElement.querySelector(
        '[data-testid="User-Name"] a[href*="/"][role="link"] span'
      );
      if (handleElement) {
        const handleText = handleElement.textContent.trim();
        if (handleText.startsWith("@")) {
          tweetData.handle = handleText.substring(1); // Remove the "@"
        }
      }
    }

    // Final fallback: Extract handle from text content
    if (!tweetData.handle || tweetData.handle === "N/A") {
      const userNameContainer = replyElement.querySelector(
        '[data-testid="User-Name"]'
      );
      if (userNameContainer) {
        const textContent = userNameContainer.textContent;
        const handleMatch = textContent.match(/@(\w+)/);
        if (handleMatch && handleMatch[1]) {
          tweetData.handle = handleMatch[1];
        } else {
          tweetData.handle = "N/A";
        }
      } else {
        tweetData.handle = "N/A";
      }
    }

    // Extract tweet text
    const tweetTextElement = replyElement.querySelector(
      '[data-testid="tweetText"]'
    );
    if (tweetTextElement) {
      // Function to recursively extract text and emojis from nodes
      const extractTextAndEmojis = (node) => {
        let text = "";
        if (node.nodeType === Node.TEXT_NODE) {
          // Text node: add its content directly
          text = node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName.toLowerCase() === "img") {
            // Image node (emoji): add its alt text
            text = node.getAttribute("alt") || "";
          } else {
            // Other element nodes (e.g., <span>, <a>): recursively process children
            node.childNodes.forEach((child) => {
              text += extractTextAndEmojis(child);
            });
          }
        }
        return text;
      };

      // Build the text by iterating through child nodes
      let textContent = "";
      tweetTextElement.childNodes.forEach((node) => {
        textContent += extractTextAndEmojis(node);
      });

      // Set the text, preserving all spaces (no trimming)
      tweetData.text = textContent || "N/A";

      // Determine if the text is RTL
      const lang = tweetTextElement.getAttribute("lang") || "";
      const rtlLanguages = ["fa", "ar", "he", "ur"];
      tweetData.isRTL = rtlLanguages.includes(lang);
    } else {
      tweetData.text = "N/A";
    }

    // Extract likes, replies, and views
    const statsElements = replyElement.querySelectorAll(
      '[data-testid="reply"], [data-testid="like"], [data-testid="unlike"]'
    );
    statsElements.forEach((element) => {
      const countElement = element.querySelector(
        '[data-testid="app-text-transition-container"] span'
      );
      const countText = countElement?.textContent.trim() || "0";
      const count = parseInt(countText.replace(/[^0-9]/g, "")) || 0;

      if (element.getAttribute("data-testid") === "reply") {
        tweetData.replies = count;
      } else if (
        element.getAttribute("data-testid") === "like" ||
        element.getAttribute("data-testid") === "unlike"
      ) {
        tweetData.likes = count;
      }
    });

    // Extract views (main tweet has a different structure)
    let views = 0;
    const viewsElement = replyElement.querySelector(
      '[data-testid="app-text-transition-container"]'
    );
    if (viewsElement) {
      const viewsText = viewsElement.textContent.trim();
      views = parseInt(viewsText.replace(/[^0-9]/g, "")) || 0;
      const parentText = viewsElement.parentElement?.textContent || "";
      if (parentText.toLowerCase().includes("views")) {
        tweetData.views = views;
      }
    }

    // Fallback for views: Check the aria-label of the stats container
    if (!tweetData.views) {
      const statsContainer = replyElement.querySelector('[role="group"]');
      if (statsContainer) {
        const ariaLabel = statsContainer.getAttribute("aria-label") || "";
        const viewsMatch = ariaLabel.match(/(\d+)\s*views/i);
        if (viewsMatch && viewsMatch[1]) {
          tweetData.views = parseInt(viewsMatch[1]) || 0;
        } else {
          tweetData.views = 0;
        }
      } else {
        tweetData.views = 0;
      }
    }

    // Ensure default values for missing stats
    tweetData.likes = tweetData.likes || 0;
    tweetData.replies = tweetData.replies || 0;

    return tweetData;
  }

  // X virtualizes the timeline with absolute cells + translateY. Document
  // scrollY comparisons miss "Discover more" and leak recommended tweets in.
  function getCellOffset(el) {
    if (!el) return Number.POSITIVE_INFINITY;
    const cell =
      el.closest?.('[data-testid="cellInnerDiv"]') ||
      (el.matches?.('[data-testid="cellInnerDiv"]') ? el : null);
    const target = cell || el;
    const style = target.getAttribute?.("style") || "";
    const match = style.match(/translateY\(([-\d.]+)px\)/);
    if (match) return parseFloat(match[1]);
    return target.getBoundingClientRect().top + window.scrollY;
  }

  function findDiscoverMoreCell() {
    return Array.from(
      document.querySelectorAll('div[data-testid="cellInnerDiv"]')
    ).find((el) => {
      const text = (el.innerText || el.textContent || "").trim();
      return (
        text.includes("Discover more") ||
        text.includes("Sourced from across X")
      );
    });
  }

  function isPastDiscoverMore(el, discoverOffset) {
    if (discoverOffset == null) return false;
    return getCellOffset(el) >= discoverOffset - 1;
  }

  function dropRepliesPastDiscoverMore(repliesWithElements) {
    const discoverCell = findDiscoverMoreCell();
    if (!discoverCell) return repliesWithElements;
    const discoverOffset = getCellOffset(discoverCell);
    return repliesWithElements.filter(
      (r) => !isPastDiscoverMore(r.element, discoverOffset)
    );
  }

  // Add stop message handler
  try {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "stopLoading") {
        isLoading = false; // Stop the loop
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
      // Open toolbar popup in the same turn as the click (user gesture).
      sendRuntimeMessage({ action: "openPopup" });

      // Initialize arrays to store replies and their DOM elements
      let repliesWithElements = [];
      let moreReplies = true;
      let scrollAttempts = 0;
      let stagnantRounds = 0;
      let hitDiscoverMore = false;
      const maxAttempts = 50;
      const maxStagnantRounds = 3;
      const seenUrls = new Set();

      // Get main post to exclude it from replies and extract its data
      const mainPost = document.querySelector('article[role="article"]');
      let mainTweetData = {};
      let mainTweetUrl = null;
      if (mainPost) {
        mainTweetData = extractReplyData(mainPost, true);
        mainTweetUrl = mainTweetData.tweetUrl;
        if (mainTweetUrl) seenUrls.add(mainTweetUrl);
      }
      // Send initial loading state with main tweet data
      sendRuntimeMessage({
        action: "sendReplies",
        replies: [],
        mainTweet: mainTweetData,
        status: "loading",
      });

      // Handle "Show additional replies" sections
      async function expandHiddenReplies() {
        const label =
          /show (additional )?replies|show more replies|show probable spam/i;
        const clickables = Array.from(
          document.querySelectorAll(
            'button, div[role="button"], article[role="article"]'
          )
        ).filter((el) => {
          const text = (el.innerText || el.textContent || "").trim();
          return text.length < 80 && label.test(text);
        });
        for (const button of clickables) {
          button.scrollIntoView({ block: "center" });
          button.click();
          await sleep(1200);
        }
      }

      while (moreReplies && scrollAttempts < maxAttempts && isLoading && !dead) {
        if (!isExtensionAlive()) {
          teardown();
          break;
        }
        await expandHiddenReplies();
        if (!isLoading) break;
        const previousCount = articleCount();

        const discoverCell = findDiscoverMoreCell();
        const discoverOffset = discoverCell
          ? getCellOffset(discoverCell)
          : null;
        if (discoverCell) hitDiscoverMore = true;

        const replyElements = Array.from(
          document.querySelectorAll('article[role="article"]')
        ).filter((el) => {
          if (el === mainPost) return false;
          if (isPastDiscoverMore(el, discoverOffset)) return false;
          const showText = el.textContent.toLowerCase();
          if (showText.includes("show additional replies")) return false;
          if (showText.includes("discover more")) return false;
          const replyData = extractReplyData(el, false);
          if (!replyData.tweetUrl || replyData.tweetUrl === "N/A") return false;
          if (replyData.tweetUrl === mainTweetUrl) return false;
          if (seenUrls.has(replyData.tweetUrl)) return false;
          return true;
        });

        replyElements.forEach((el) => {
          const replyData = extractReplyData(el, false);
          seenUrls.add(replyData.tweetUrl);
          repliesWithElements.push({
            element: el,
            data: replyData,
          });
        });

        // Drop anything that slipped past Discover more (virtualized recycle).
        repliesWithElements = dropRepliesPastDiscoverMore(repliesWithElements);

        const currentReplies = repliesWithElements.map((r) => r.data);
        sendRuntimeMessage({
          action: "sendReplies",
          replies: currentReplies,
          mainTweet: mainTweetData,
          status: "loading",
        });

        if (hitDiscoverMore) {
          moreReplies = false;
          break;
        }

        const grew = await scrollToLoadMore(previousCount);
        scrollAttempts++;
        if (grew) {
          stagnantRounds = 0;
          moreReplies = true;
        } else {
          stagnantRounds++;
          moreReplies = stagnantRounds < maxStagnantRounds;
        }
        if (!isLoading) break; // Exit if loading is stopped
      }

      if (dead) return;

      repliesWithElements = dropRepliesPastDiscoverMore(repliesWithElements);
      let finalReplies = repliesWithElements
        .map((r) => r.data)
        .filter((reply) => reply.tweetUrl !== mainTweetUrl);

      // If stopped, send the stopped state with collected replies
      if (!isLoading) {
        sendRuntimeMessage({
          action: "sendReplies",
          replies: finalReplies,
          mainTweet: mainTweetData,
          status: "stopped",
        });
        return; // Exit the function
      }

      sendRuntimeMessage({
        action: "sendReplies",
        replies: finalReplies,
        mainTweet: mainTweetData,
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

  // Observe DOM for navigation/changes
  observer = new MutationObserver(() => {
    injectXtractButton();
  });

  // Start observing
  const targetNode =
    document.querySelector('div[data-testid="primaryColumn"]') || document.body;
  observer.observe(targetNode, { childList: true, subtree: true });
  injectXtractButton();
})();
