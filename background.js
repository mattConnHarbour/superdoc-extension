let viewerDownloadIds = new Set();
let extensionEnabled = true;

// Import the bundled docx validator
importScripts('dist/docx-validator.bundle.js');

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
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === 'trackViewerDownload') {
    viewerDownloadIds.add(request.downloadId);
    console.log('Tracking viewer download:', request.downloadId);
    sendResponse({ success: true });
  } else if (request.action === 'toggleExtension') {
    extensionEnabled = request.enabled;
    updateIcon(extensionEnabled);
    console.log('Extension toggled:', extensionEnabled ? 'enabled' : 'disabled');
    sendResponse({ success: true });
  } else if (request.action === 'executeSuperdocScript') {
    try {
      // Execute the SuperDoc library in the sender's tab
      await chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        files: ['lib/superdoc.umd.js']
      });
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error executing SuperDoc script:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true; // Keep message channel open for async response
  } else if (request.action === 'downloadFile') {
    try {
      // Download file using Chrome downloads API
      const downloadId = await chrome.downloads.download({
        url: request.url,
        filename: request.filename,
        saveAs: true
      });

      // Track this download to ignore it
      viewerDownloadIds.add(downloadId);
      console.log('File download initiated:', request.filename, 'ID:', downloadId);
      
      sendResponse({ success: true, downloadId: downloadId });
    } catch (error) {
      console.error('Error downloading file:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true; // Keep message channel open for async response
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
  
  // Validate and correct the DOCX file
  let correctedBlob = blob;
  try {
    console.log('Validating and correcting DOCX file...');
    correctedBlob = await DocxValidator.validateAndCorrectDocx(blob);
    console.log('DOCX validation and correction completed');
  } catch (error) {
    console.error('Error validating DOCX:', error);
    // Continue with original blob if validation fails
  }
  
  const base64Data = await blobToBase64(correctedBlob);
  
  // Get the active tab and send message to content script
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length === 0) return;
  
  // Send message to content script to display modal
  chrome.tabs.sendMessage(tabs[0].id, {
    action: 'displayFile',
    data: {
      filename: download.filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: correctedBlob.size,
      base64Data
    }
  }).catch(error => {
    console.error('Error sending message to content script:', error);
  });
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