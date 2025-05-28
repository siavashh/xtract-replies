let extractionTabId = null;
let popupWindowId = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openPopup") {
    extractionTabId = sender.tab ? sender.tab.id : null;
    chrome.windows.create(
      {
        url: chrome.runtime.getURL("popup.html"),
        type: "popup",
        width: 600,
        height: 400,
      },
      (window) => {
        popupWindowId = window.id;
      }
    );
  } else if (request.action === "sendReplies") {
    if (popupWindowId) {
      chrome.runtime.sendMessage({
        action: "updatePopup",
        replies: request.replies,
        status: request.status,
      });
    }
  } else if (request.action === "stopLoading") {
    if (extractionTabId) {
      chrome.tabs.sendMessage(
        extractionTabId,
        { action: "stopLoading" },
        (response) => {
          sendResponse(response);
        }
      );
      return true;
    } else {
      sendResponse({ status: "error", message: "No extraction tab found" });
    }
  }
});
