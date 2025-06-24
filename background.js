// Listen for completed downloads
chrome.downloads.onChanged.addListener(async (downloadDelta) => {
  if (downloadDelta.state && downloadDelta.state.current === 'complete') {
    try {
      await readFileToBlob(downloadDelta.id);
    } catch (error) {
      console.error('Error reading downloaded file:', error);
    }
  }
});

// Function to read downloaded file into blob
async function readFileToBlob(downloadId) {
  // Get download details
  const downloads = await chrome.downloads.search({ id: downloadId });
  if (downloads.length === 0) return;
  
  const download = downloads[0];
  
  // Only process DOCX files
  if (!download.filename.toLowerCase().endsWith('.docx')) {
    console.log('Not a DOCX file, skipping:', download.filename);
    return;
  }
  
  const mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  
  // Read the file as an array buffer
  // const fileData = await readDownloadedFile(download);
  const blob = await readDownloadedFile(download);
  
  // Create blob
  // const blob = new Blob([fileData], { type: mimeType });
  
  // Open viewer and send blob data
  await openViewerWithBlob({
    blob,
    filename: download.filename,
    mimeType,
    fileSize: download.fileSize,
    originalUrl: download.url
  });
}

// Function to open viewer window and send blob data
async function openViewerWithBlob(viewerData) {
  // Create new window with the viewer
  const newWindow = await chrome.windows.create({
    url: chrome.runtime.getURL('viewer.html'),
    type: 'popup',
    width: 1000,
    height: 700
  });
  
  // Send data to the viewer tab
  setTimeout(() => {
    chrome.tabs.query({ windowId: newWindow.id }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'displayFile',
          data: viewerData
        });
      }
    });
  }, 1000);
}

// Function to read downloaded file
async function readDownloadedFile(download) {
  try {
    const response = await fetch(`file://${download.filename}`);
    // return file blob
    return await response.blob();
    // const arrayBuffer = await response.arrayBuffer();
    // return arrayBuffer;
  } catch (error) {
    console.error('Error fetching file by path:', error);
    throw error;
  }
}