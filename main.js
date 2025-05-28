(function () {
  let isLoading = true;

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
  function findGrokButton() {
    const mainPost = document.querySelector('article[role="article"]');
    if (!mainPost) return null;
    return mainPost.querySelector('button[aria-label="Grok actions"]');
  }

  // Inject our button next to Grok
  let lastInjected = null;
  function injectXtractButton() {
    const grokBtn = findGrokButton();
    if (!grokBtn) return;
    const grokParent = grokBtn.parentElement;
    if (!grokParent) return;
    if (
      grokParent.parentElement.querySelector(".xtract-replies-btn") &&
      lastInjected === grokParent
    )
      return;
    lastInjected = grokParent;
    const wrapper = document.createElement("div");
    wrapper.className = grokParent.className;
    const btn = document.createElement("button");
    btn.className = "xtract-replies-btn";
    btn.type = "button";
    btn.style.padding = "0";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.width = "34px";
    btn.style.height = "34px";
    const img = document.createElement("img");
    img.src = chrome.runtime.getURL("assets/48.png");
    img.style.width = "24px";
    img.style.height = "24px";
    btn.appendChild(img);
    btn.onclick = startExtraction;
    wrapper.appendChild(btn);
    grokParent.parentElement.insertBefore(wrapper, grokParent.nextSibling);
  }

  // Scroll to load more replies
  async function scrollToBottom() {
    const scrollContainer = document.querySelector(
      'div[data-testid="primaryColumn"]'
    );
    if (!scrollContainer) return false;

    const currentScroll = scrollContainer.scrollHeight;
    scrollContainer.scrollIntoView({ behavior: "smooth", block: "end" });

    await new Promise((resolve) => setTimeout(resolve, 2000));
    const newScroll = scrollContainer.scrollHeight;
    return currentScroll !== newScroll;
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

  // Add stop message handler
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "stopLoading") {
      isLoading = false; // Stop the loop
      sendResponse({ status: "stopped" });
      return true;
    }
  });

  async function startExtraction() {
    try {
      // Open popup
      chrome.runtime.sendMessage({ action: "openPopup" });

      // Initialize arrays to store replies and their DOM elements
      let repliesWithElements = [];
      let moreReplies = true;
      let scrollAttempts = 0;
      const maxAttempts = 30;

      // Get main post to exclude it from replies and extract its data
      const mainPost = document.querySelector('article[role="article"]');
      let mainTweetData = {};
      let mainTweetUrl = null;
      if (mainPost) {
        mainTweetData = extractReplyData(mainPost, true);
        mainTweetUrl = mainTweetData.tweetUrl;
      }
      // Send initial loading state with main tweet data
      chrome.runtime.sendMessage({
        action: "sendReplies",
        replies: [],
        mainTweet: mainTweetData,
        status: "loading",
      });

      // Handle "Show additional replies" sections
      async function expandHiddenReplies() {
        const showMoreButtons = Array.from(
          document.querySelectorAll('article[role="article"]')
        ).filter((el) =>
          el.textContent.toLowerCase().includes("show additional replies")
        );
        for (const button of showMoreButtons) {
          button.scrollIntoView({ behavior: "smooth", block: "center" });
          button.click();
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }

      while (moreReplies && scrollAttempts < maxAttempts && isLoading) {
        await expandHiddenReplies();
        if (!isLoading) break;

        const replyElements = Array.from(
          document.querySelectorAll('article[role="article"]')
        ).filter((el) => {
          if (el === mainPost) return false;
          const showText = el.textContent.toLowerCase();
          if (showText.includes("show additional replies")) return false;
          const replyData = extractReplyData(el, false);
          if (replyData.tweetUrl === mainTweetUrl) return false;
          return true;
        });

        replyElements.forEach((el) => {
          const replyData = extractReplyData(el, false);
          const existing = repliesWithElements.find(
            (r) => r.data.tweetUrl === replyData.tweetUrl
          );
          if (!existing) {
            repliesWithElements.push({
              element: el,
              data: replyData,
            });
          }
        });

        const currentReplies = repliesWithElements.map((r) => r.data);
        chrome.runtime.sendMessage({
          action: "sendReplies",
          replies: currentReplies,
          mainTweet: mainTweetData,
          status: "loading",
        });

        moreReplies = await scrollToBottom();
        scrollAttempts++;
        if (!isLoading) break; // Exit if loading is stopped
      }

      // If stopped, send the stopped state with collected replies
      if (!isLoading) {
        const stoppedReplies = repliesWithElements.map((r) => r.data);
        chrome.runtime.sendMessage({
          action: "sendReplies",
          replies: stoppedReplies,
          mainTweet: mainTweetData,
          status: "stopped",
        });
        return; // Exit the function
      }

      // After collecting all replies, find the "Discover more" section
      const discoverMoreSection = Array.from(
        document.querySelectorAll('div[data-testid="cellInnerDiv"]')
      ).find((el) => el.textContent.includes("Discover more"));

      let finalReplies = repliesWithElements.map((r) => r.data);

      if (discoverMoreSection) {
        const discoverMorePosition =
          discoverMoreSection.getBoundingClientRect().top + window.scrollY;
        finalReplies = repliesWithElements
          .filter((r) => {
            const replyPosition =
              r.element.getBoundingClientRect().top + window.scrollY;
            return replyPosition < discoverMorePosition;
          })
          .map((r) => r.data);
      }

      if (mainTweetUrl) {
        finalReplies = finalReplies.filter(
          (reply) => reply.tweetUrl !== mainTweetUrl
        );
      }

      chrome.runtime.sendMessage({
        action: "sendReplies",
        replies: finalReplies,
        mainTweet: mainTweetData,
        status: "complete",
      });
    } catch (error) {
      chrome.runtime.sendMessage({
        action: "sendReplies",
        replies: [],
        mainTweet: {},
        status: "error",
      });
    }
  }

  // Observe DOM for navigation/changes
  const observer = new MutationObserver(() => {
    injectXtractButton();
  });

  // Start observing
  const targetNode =
    document.querySelector('div[data-testid="primaryColumn"]') || document.body;
  observer.observe(targetNode, { childList: true, subtree: true });
})();
