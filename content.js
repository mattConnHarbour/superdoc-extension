let superdoc = null;
let currentFileData = null;
let modalContainer = null;

// Load modal HTML from file
async function loadModalHTML() {
  try {
    const response = await fetch(chrome.runtime.getURL('modal.html'));
    if (!response.ok) {
      throw new Error(`Failed to load modal HTML: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error('Error loading modal HTML:', error);
    return null;
  }
}

// Inject CSS for modal
function injectModalCSS() {
  if (document.getElementById('superdoc-anywhere-extension__modal-css')) return;
  
  const style = document.createElement('style');
  style.id = 'superdoc-anywhere-extension__modal-css';
  style.textContent = `
    #superdoc-anywhere-extension__modal * {
      box-sizing: border-box;
    }
    
    #superdoc-anywhere-extension__download-btn:hover {
      background: #0056b3 !important;
    }
    
    #superdoc-anywhere-extension__close-btn:hover {
      background: #545b62 !important;
    }
  `;
  document.head.appendChild(style);
}

// Load SuperDoc library (should already be loaded via content script)
async function loadSuperDoc() {
  try {
    // Load CSS
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = chrome.runtime.getURL('lib/style.css');
    document.head.appendChild(cssLink);
    
    // Check if SuperDoc library is available
    if (window.SuperDocLibrary) {
      return [true, null];
    } else {
      return [false, new Error('SuperDocLibrary not found - should be loaded via content script')];
    }
    
  } catch (error) {
    console.error('Error loading SuperDoc:', error);
    return [false, error];
  }
}

// Create modal
async function createModal() {
  if (modalContainer) return modalContainer;
  
  injectModalCSS();
  
  // Load external modal CSS
  const modalCssLink = document.createElement('link');
  modalCssLink.rel = 'stylesheet';
  modalCssLink.href = chrome.runtime.getURL('modal.css');
  document.head.appendChild(modalCssLink);
  
  // Load modal HTML from file
  const modalHTML = await loadModalHTML();
  if (!modalHTML) {
    console.error('Failed to load modal HTML');
    return null;
  }
  
  const div = document.createElement('div');
  div.innerHTML = modalHTML;
  modalContainer = div.firstElementChild;
  
  // Set the logo source after loading the HTML
  const logoImg = modalContainer.querySelector('#superdoc-anywhere-extension__logo');
  if (logoImg) {
    // Try to get the page's favicon from gstatic first
    const currentDomain = window.location.hostname;
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${currentDomain}&sz=32`;
    
    logoImg.src = faviconUrl;
    
    // Fallback to extension logo if favicon fails to load
    logoImg.onerror = () => {
      logoImg.src = chrome.runtime.getURL('icons/logo.webp');
    };
  }
  
  // Set the document title
  const titleElement = modalContainer.querySelector('#superdoc-anywhere-extension__document-title');
  if (titleElement && currentFileData) {
    const filename = currentFileData.filename.split('/').pop(); // Get just the filename
    const title = filename.replace(/\.[^/.]+$/, ""); // Remove file extension
    titleElement.textContent = title || "Untitled Document";
  }
  
  document.body.appendChild(modalContainer);
  
  // Setup event listeners
  const closeBtn = modalContainer.querySelector('#superdoc-anywhere-extension__close-btn');
  const downloadBtn = modalContainer.querySelector('#superdoc-anywhere-extension__download-btn');
  
  closeBtn.addEventListener('click', closeModal);
  downloadBtn.addEventListener('click', downloadCurrentFile);
  
  // Close on background click
  modalContainer.addEventListener('click', (e) => {
    if (e.target === modalContainer) {
      closeModal();
    }
  });
  
  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalContainer.style.display !== 'none') {
      closeModal();
    }
  });
  
  return modalContainer;
}

// Close modal
function closeModal() {
  if (modalContainer) {
    if (superdoc) {
      try {
        superdoc.destroy();
      } catch (error) {
        console.log('Error destroying SuperDoc:', error);
      }
      superdoc = null;
    }
    // Remove modal from DOM completely
    modalContainer.remove();
    modalContainer = null;
    currentFileData = null;
  }
}

// Show modal
function showModal() {
  if (modalContainer) {
    modalContainer.style.display = 'flex';
  }
}

// Convert base64 to blob
function base64ToBlob(base64Data, mimeType) {
  const bytes = atob(base64Data);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    array[i] = bytes.charCodeAt(i);
  }
  return new Blob([array], { type: mimeType });
}

// Initialize SuperDoc in modal
async function initSuperdoc(data) {
  console.log('Initializing SuperDoc in modal');
  
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
      selector: '#superdoc-anywhere-extension__docx-viewer',
      toolbar: '#superdoc-anywhere-extension__toolbar',
      documentMode: 'editing',
      pagination: true,
      rulers: true,
      document: superdocFile,
      onReady: () => console.log('SuperDoc ready in modal'),
      onEditorCreate: () => console.log('Editor created in modal')
    };
    
    superdoc = new SuperDocLibrary.SuperDoc(config);
    // unhide selector
    const viewerElement = modalContainer.querySelector('#superdoc-anywhere-extension__docx-viewer');
    if (viewerElement) {
      viewerElement.style.display = 'flex';
    }
    console.log('SuperDoc initialized in modal');
    
  } catch (error) {
    console.error('Error:', error.message);
    showFallback(data);
  }
}

// Download current file
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
    
    // Send download request to background script
    const response = await chrome.runtime.sendMessage({
      action: 'downloadFile',
      url: dataUrl,
      filename: fileName
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'Download failed');
    }

    console.log('File download initiated:', fileName, 'ID:', response.downloadId);
  } catch (error) {
    console.error('Error downloading file:', error);
  }
}

// Show fallback content
function showFallback(data) {
  const container = modalContainer.querySelector('#superdoc-anywhere-extension__viewer');
  const bytes = data.fileSize;
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const formattedSize = bytes === 0 ? '0 B' : Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  
  container.innerHTML = `
    <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif;">
      <h2 style="margin: 0 0 10px 0;">File: ${data.filename}</h2>
      <p style="margin: 0 0 10px 0;">Size: ${formattedSize}</p>
      <p style="margin: 0;">SuperDoc unavailable - cannot display document.</p>
    </div>
  `;
}

// Initialize SuperDoc with HTML content for markdown files
async function initSuperdocWithHTML(data) {
  console.log('Initializing SuperDoc with HTML content');
  
  try {
    if (!window.SuperDocLibrary?.SuperDoc) {
      console.error('SuperDocLibrary not available');
      showMarkdownFallback(data);
      return;
    }
    
    // Create a simple HTML document structure
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${data.filename}</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; line-height: 1.6; }
          h1, h2, h3 { color: #333; }
          code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
          pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
          blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 20px; }
        </style>
      </head>
      <body>
        ${data.htmlContent}
      </body>
      </html>
    `;
    
    
    const config = {
      selector: '#superdoc-anywhere-extension__markdown-viewer',
      documentMode: 'editing',
      pagination: true,
      rulers: true,
      mode: 'html',
      content: htmlContent,
      onReady: () => console.log('SuperDoc ready with HTML content'),
      onEditorCreate: () => console.log('Editor created with HTML content'),
      converter: SuperDocLibrary.SuperConverter
    };
    
    superdoc = new SuperDocLibrary.Editor(config);
    // unhide selector
    const viewerElement = modalContainer.querySelector('#superdoc-anywhere-extension__markdown-viewer');
    if (viewerElement) {
      viewerElement.style.display = 'flex';
    }
    console.log('SuperDoc initialized with HTML content');

    // TODO - toolbar

    // const toolbar = new SuperDocLibrary.SuperToolbar({ element: 'superdoc-anywhere-extension__toolbar', editor: superdoc, isDev: true, pagination: true, });
    
  } catch (error) {
    console.error('Error initializing SuperDoc with HTML:', error.message);
    showMarkdownFallback(data);
  }
}

// Show fallback content for markdown files
function showMarkdownFallback(data) {
  const container = modalContainer.querySelector('#superdoc-anywhere-extension__viewer');
  
  container.innerHTML = `
    <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif; max-height: 500px; overflow-y: auto;">
      <h2 style="margin: 0 0 20px 0; color: #333;">Markdown File: ${data.filename}</h2>
      <div style="border: 1px solid #ddd; border-radius: 5px; padding: 20px; background: #f9f9f9;">
        ${data.htmlContent}
      </div>
      <p style="margin: 20px 0 0 0; color: #666; font-size: 14px;">SuperDoc unavailable - showing converted HTML content.</p>
    </div>
  `;
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener(async (request, _, sendResponse) => {
  // Handle selected HTML capture
  if (request.action === 'captureSelectedHTML') {
    console.log('Capturing selected HTML for SuperDoc');
    
    // Get the current selection
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      try {
        // Get the range of the selection
        const range = selection.getRangeAt(0);
        
        // Extract the HTML content of the selection
        const tempDiv = document.createElement('div');
        tempDiv.appendChild(range.cloneContents());
        const htmlContent = tempDiv.innerHTML;
        
        console.log('Captured HTML:', htmlContent);
        
        // Create data object similar to markdown processing
        const currentDomain = window.location.hostname;
        const data = {
          filename: `Selected content from ${currentDomain}.html`,
          htmlContent: htmlContent,
          originalSource: 'webpage_selection'
        };
        
        // Store as current file data
        currentFileData = data;
        
        // Load SuperDoc library
        await loadSuperDoc();
        
        // Create and show modal
        await createModal();
        showModal();
        
        // Initialize SuperDoc with HTML content
        await initSuperdocWithHTML(data);
        
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error capturing HTML:', error);
        sendResponse({ success: false, error: error.message });
      }
    } else {
      console.error('No selection found');
      alert('No selection found.');
      sendResponse({ success: false, error: 'No selection found' });
    }
    
    return true;
  }
  
  // Handle DOCX files
  if (request.action === 'displayFile' && request.data.base64Data) {
    console.log('Received DOCX file data from background, displaying in modal');
    
    const blob = base64ToBlob(request.data.base64Data, request.data.mimeType);
    const data = { ...request.data, blob };
    currentFileData = data;
    
    // Load SuperDoc library
    const [superdocLoaded, loadError] = await loadSuperDoc();
    if (!superdocLoaded) {
      console.error('Failed to load SuperDoc library:', loadError);
    }
    
    // Create and show modal
    await createModal();
    showModal();
    
    // Initialize SuperDoc
    await initSuperdoc(data);
    
    sendResponse({ success: true });
  }
  
  // Handle Markdown files
  else if (request.action === 'displayMarkdown' && request.data.htmlContent) {
    console.log('Received markdown file data from background, displaying in modal');
    
    currentFileData = request.data;
    
    // Load SuperDoc library
    const [superdocLoaded, loadError] = await loadSuperDoc();
    if (!superdocLoaded) {
      console.error('Failed to load SuperDoc library:', loadError);
    }
    
    // Create and show modal
    await createModal();
    showModal();
    
    // Initialize SuperDoc with HTML content
    await initSuperdocWithHTML(request.data);
    
    sendResponse({ success: true });
  }
});