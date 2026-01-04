document.getElementById('downloadBtn').addEventListener('click', async () => {
  const button = document.getElementById('downloadBtn');
  const status = document.getElementById('status');

  button.disabled = true;
  button.textContent = 'Downloading...';
  status.className = 'status show';
  status.textContent = 'Starting download...';

  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Check if we're on Discord
    if (!tab.url.includes('discord.com')) {
      throw new Error('Please navigate to a Discord DM conversation first.');
    }

    // Try to inject the content script if it's not already loaded
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      // Wait a moment for the script to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (injectError) {
      // Script might already be injected, continue
      console.log('Script injection attempted:', injectError);
    }

    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'startDownload' });

    if (response && response.status === 'started') {
      status.className = 'status show success';
      status.textContent = 'Download started! Check the page for progress notifications.';

      setTimeout(() => {
        window.close();
      }, 2000);
    } else {
      throw new Error('Unexpected response from content script');
    }
  } catch (error) {
    console.error('Error:', error);
    status.className = 'status show error';

    if (error.message.includes('Receiving end does not exist')) {
      status.textContent = 'Please reload the Discord page and try again.';
    } else {
      status.textContent = error.message || 'Error: Make sure you are on a Discord DM page.';
    }

    button.disabled = false;
    button.textContent = 'Download DM History';
  }
});
