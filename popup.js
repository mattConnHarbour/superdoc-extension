// Get DOM elements
const toggle = document.getElementById('toggle');
const status = document.getElementById('status');

// Load current state from storage
chrome.storage.sync.get(['extensionEnabled'], (result) => {
  const isEnabled = result.extensionEnabled !== false; // Default to enabled
  updateUI(isEnabled);
});

// Handle toggle click
toggle.addEventListener('click', () => {
  chrome.storage.sync.get(['extensionEnabled'], (result) => {
    const currentState = result.extensionEnabled !== false;
    const newState = !currentState;
    
    // Save new state
    chrome.storage.sync.set({ extensionEnabled: newState }, () => {
      updateUI(newState);
      
      // Notify background script of state change
      chrome.runtime.sendMessage({
        action: 'toggleExtension',
        enabled: newState
      });
    });
  });
});

// Update UI based on enabled state
function updateUI(isEnabled) {
  if (isEnabled) {
    toggle.classList.add('enabled');
    status.textContent = 'Extension is enabled';
  } else {
    toggle.classList.remove('enabled');
    status.textContent = 'Extension is disabled';
  }
}