// Content script for viewer.html
let superdoc = null;

// Listen for blob data from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'displayFile' && request.data.blob) {
    console.log('Received blob data:', request.data);
    
    // Initialize SuperDoc when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => initializeSuperdoc(request.data));
    } else {
      initializeSuperdoc(request.data);
    }
    
    sendResponse({ success: true });
  }
});

function initializeSuperdoc(data) {
  // convert blob to file blob if needed
  // convert blob to base64 if needed
  // const arrayBufferPromise = data.blob.arrayBuffer();
  // const fileObject = SuperDocLibrary.getFileObject(data.originalUrl, data.filename, data.mimeType);
  console.log('Initializing SuperDoc with data:', data.blob);
  // Check if SuperDocLibrary.SuperDoc is available globally
  if (window.SuperDocLibrary && window.SuperDocLibrary.SuperDoc) {
    const config = {
      selector: '#superdoc',
      toolbar: '#my-toolbar',
      documentMode: 'editing',
      pagination: true,
      rulers: true,
      // document: data.blob,
      document: data.blob,
      onReady: (event) => {
        console.log('SuperDoc is ready', event);
      },
      onEditorCreate: (event) => {
        console.log('Editor is created', event);
      },
    };
    
    superdoc = new SuperDocLibrary.SuperDoc(config);
  } else {
    console.error('SuperDocLibrary.SuperDoc not available. Make sure the library is loaded in viewer.html');
    displayFallbackContent(data);
  }
}

function displayFallbackContent(data) {
  const container = document.getElementById('superdoc') || document.body;
  container.innerHTML = `
    <div style="padding: 20px;">
      <h2>File: ${data.filename}</h2>
      <p>Size: ${formatFileSize(data.fileSize)}</p>
      <p>SuperDocLibrary not loaded. Cannot display document content.</p>
    </div>
  `;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}