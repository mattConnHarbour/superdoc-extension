let viewerDownloadIds = new Set();
let extensionEnabled = true;

// Update extension icon based on enabled state
function updateIcon(enabled) {
  const iconPath = enabled ? {
    "16": "icons/icon-16x16.png",
    "19": "icons/icon-19x19.png",
    "48": "icons/icon-48x48.png",
    "128": "icons/icon-128x128.png"
  } : {
    "16": "icons/icon-16x16-disabled.png",
    "19": "icons/icon-19x19-disabled.png",
    "48": "icons/icon-48x48-disabled.png",
    "128": "icons/icon-128x128-disabled.png"
  };
  
  chrome.action.setIcon({ path: iconPath });
}

// Load extension state from storage and set initial icon
chrome.storage.sync.get(['extensionEnabled'], (result) => {
  extensionEnabled = result.extensionEnabled !== false; // Default to enabled
  updateIcon(extensionEnabled);
});

// Listen for messages
chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
  if (request.action === 'trackViewerDownload') {
    viewerDownloadIds.add(request.downloadId);
    console.log('Tracking viewer download:', request.downloadId);
    sendResponse({ success: true });
  } else if (request.action === 'toggleExtension') {
    extensionEnabled = request.enabled;
    updateIcon(extensionEnabled);
    console.log('Extension toggled:', extensionEnabled ? 'enabled' : 'disabled');
    sendResponse({ success: true });
  }
});

// chrome download event listener (on download completion, so writes to disk first)
chrome.downloads.onChanged.addListener(async (downloadDelta) => {
  if (downloadDelta.state?.current === 'complete') {
    // Check if extension is disabled
    if (!extensionEnabled) {
      console.log('Extension disabled, ignoring download');
      return;
    }
    
    // Check if this is a download from viewer - if so, ignore it
    if (viewerDownloadIds.has(downloadDelta.id)) {
      viewerDownloadIds.delete(downloadDelta.id);
      console.log('Ignoring viewer download completion:', downloadDelta.id);
      return;
    }
    
    try {
      await processDownload(downloadDelta.id);
    } catch (error) {
      console.error('Error processing download:', error);
    }
  }
});

async function processDownload(downloadId) {
  const downloads = await chrome.downloads.search({ id: downloadId });
  if (downloads.length === 0) return;
  
  // docx only
  const download = downloads[0];
  if (!download.filename.toLowerCase().endsWith('.docx')) return;
  
  // fetch and stringify (actual blob was getting dropped on message to viewer.js)
  const response = await fetch(`file://${download.filename}`);
  const blob = await response.blob();
  const base64Data = await blobToBase64(blob);
  
  // open viewer window
  const window = await chrome.windows.create({
    url: chrome.runtime.getURL('viewer.html'),
    type: 'popup',
    width: 1000,
    height: 700
  });
  
  setTimeout(() => {
    chrome.tabs.query({ windowId: window.id }, (tabs) => {
      if (!tabs || tabs.length === 0) return;

      // pass along file to viewer
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'displayFile',
        data: {
          filename: download.filename,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSize: download.fileSize,
          base64Data
        }
      });
    });
  }, 1000);
}

// convert blob to string, actual blob was getting dropped on message to viewer.js
async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}