const SESSION_KEYS = ["extractionState", "extractionTabId"];
const hasSessionStorage =
  typeof chrome !== "undefined" &&
  chrome.storage &&
  typeof chrome.storage.session !== "undefined";

let extractionTabId = null;
let extractionState = {
  replies: [],
  mainTweet: {},
  status: "idle",
};

const ready = hasSessionStorage
  ? chrome.storage.session.get(SESSION_KEYS).then((data) => {
      if (data.extractionState) extractionState = data.extractionState;
      if (data.extractionTabId) extractionTabId = data.extractionTabId;
      setBadge(extractionState);
    })
  : Promise.resolve();

function persistState() {
  if (!hasSessionStorage) return;
  chrome.storage.session.set({
    extractionState,
    extractionTabId,
  });
}

function setBadge(state) {
  // Badge is a live progress cue only - clear when not actively loading.
  let text = "";
  if (state.status === "loading") {
    const count = (state.replies && state.replies.length) || 0;
    text = count > 0 ? String(count) : "...";
  }
  chrome.action.setBadgeBackgroundColor({ color: "#2a9d8f" });
  chrome.action.setBadgeText({ text });
}

function clearBadge() {
  chrome.action.setBadgeText({ text: "" });
}

function broadcastState() {
  persistState();
  setBadge(extractionState);
  chrome.runtime.sendMessage(
    {
      action: "updatePopup",
      replies: extractionState.replies,
      mainTweet: extractionState.mainTweet,
      status: extractionState.status,
    },
    () => void chrome.runtime.lastError,
  );
}

function openToolbarPopup() {
  if (typeof chrome.action.openPopup !== "function") return;
  // Must stay synchronous in the onMessage turn so the in-page click
  // still counts as a user gesture (Chrome 127+).
  chrome.action.openPopup(() => {
    void chrome.runtime.lastError;
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openPopup") {
    extractionTabId = sender.tab ? sender.tab.id : extractionTabId;
    persistState();
    openToolbarPopup();
    sendResponse({ status: "ok" });
    return;
  }

  if (request.action === "sendReplies") {
    extractionState = {
      replies: request.replies || [],
      mainTweet: request.mainTweet || {},
      status: request.status || "idle",
    };
    if (sender.tab && sender.tab.id) {
      extractionTabId = sender.tab.id;
    }
    broadcastState();
    sendResponse({ status: "ok" });
    return;
  }

  if (request.action === "getExtractionState") {
    ready.then(() => {
      sendResponse({
        replies: extractionState.replies,
        mainTweet: extractionState.mainTweet,
        status: extractionState.status,
      });
    });
    return true;
  }

  if (request.action === "clearBadge") {
    clearBadge();
    sendResponse({ status: "ok" });
    return;
  }

  if (request.action === "resetExtraction") {
    extractionState = {
      replies: [],
      mainTweet: {},
      status: "idle",
    };
    persistState();
    clearBadge();
    sendResponse({ status: "ok" });
    return;
  }

  if (request.action === "stopLoading") {
    if (!extractionTabId) {
      sendResponse({ status: "error", message: "No extraction tab found" });
      return;
    }
    chrome.tabs.sendMessage(
      extractionTabId,
      { action: "stopLoading" },
      (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            status: "error",
            message: chrome.runtime.lastError.message,
          });
          return;
        }
        sendResponse(response);
      },
    );
    return true;
  }
});
