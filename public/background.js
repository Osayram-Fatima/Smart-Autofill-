/* global chrome */
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

let lastActiveTabId = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "PAGE_LOADED") {
    if (sender.tab) lastActiveTabId = sender.tab.id;
  }

  if (msg.type === "PING") {
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "TO_CONTENT") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.id) {
        sendResponse({ ok: false, error: "No active tab." });
        return;
      }
      chrome.tabs.sendMessage(tab.id, msg.payload, (resp) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: "Content script not reachable. Reload the page." });
        } else {
          sendResponse({ ok: true, data: resp });
        }
      });
    });
    return true;
  }
});