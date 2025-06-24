let superdoc = null;
let currentFileData = null;

// hydrate base64 string to Blob
function base64ToBlob(base64Data, mimeType) {
  const bytes = atob(base64Data);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    array[i] = bytes.charCodeAt(i);
  }
  return new Blob([array], { type: mimeType });
}

chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
  if (request.action !== 'displayFile' || !request.data.base64Data) return;
  
  console.log('Received file data from background');
  
  const blob = base64ToBlob(request.data.base64Data, request.data.mimeType);
  const data = { ...request.data, blob };
  currentFileData = data;
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initSuperdoc(data);
      setupDownloadButton();
    });
  } else {
    initSuperdoc(data);
    setupDownloadButton();
  }
  
  // message response
  sendResponse({ success: true });
});

async function initSuperdoc(data) {
  console.log('Initializing SuperDoc');
  
  try {
    if (!window.SuperDocLibrary?.SuperDoc) {
      console.error('SuperDocLibrary not available');
      showFallback(data);
      return;
    }
    
    const file = new File([data.blob], data.filename, { type: data.mimeType });
    const fileUrl = URL.createObjectURL(file);
    const superdocFile = await SuperDocLibrary.getFileObject(fileUrl, data.filename, data.mimeType);
    
    const config = {
      selector: '#superdoc',
      toolbar: '#toolbar',
      documentMode: 'editing',
      pagination: true,
      rulers: true,
      document: superdocFile,
      onReady: () => console.log('SuperDoc ready'),
      onEditorCreate: () => console.log('Editor created')
    };
    
    superdoc = new SuperDocLibrary.SuperDoc(config);
    console.log('SuperDoc initialized');
    
  } catch (error) {
    console.error('Error:', error.message);
    showFallback(data);
  }
}

// Setup download button functionality
function setupDownloadButton() {
  const downloadBtn = document.getElementById('download-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadCurrentFile);
  }
}

// Download the current file using Chrome downloads API to prevent triggering extension
async function downloadCurrentFile() {
  if (!currentFileData) {
    console.error('No file data available for download');
    return;
  }

  try {
    console.log('SuperDoc instance:', superdoc);
    // Export the current document from SuperDoc editor
    const blobToDownload = await superdoc.activeEditor.exportDocx();

    // Convert blob to data URL for Chrome downloads API with correct MIME type
    const docxMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const docxBlob = new Blob([blobToDownload], { type: docxMimeType });
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(docxBlob);
    });

    // Use Chrome downloads API instead of download link to prevent extension trigger
    let fileName = currentFileData.filename;
    if (fileName.includes('/') || fileName.includes('\\')) {
      fileName = fileName.split('/').pop().split('\\').pop();
    }
    
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: fileName,
      saveAs: true
    });

    // Notify background script to ignore this download
    chrome.runtime.sendMessage({
      action: 'trackViewerDownload',
      downloadId: downloadId
    });

    console.log('File download initiated:', fileName, 'ID:', downloadId);
  } catch (error) {
    console.error('Error downloading file:', error);
  }
}

function showFallback(data) {
  // for file size presentation - proof that file is real despite failure
  const container = document.getElementById('superdoc') || document.body;
  const bytes = data.fileSize;
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const formattedSize = bytes === 0 ? '0 B' : Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  
  container.innerHTML = `
    <div style="padding: 20px;">
      <h2>File: ${data.filename}</h2>
      <p>Size: ${formattedSize}</p>
      <p>SuperDoc unavailable - cannot display document.</p>
    </div>
  `;
}