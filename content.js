// Content script for Discord DM Downloader

// Prevent multiple injection
if (window.discordDMDownloaderLoaded) {
  console.log('Discord DM Downloader already loaded, skipping...');
} else {
  window.discordDMDownloaderLoaded = true;

let isScrolling = false;
let messages = [];

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startDownload') {
    startMessageCollection();
    sendResponse({ status: 'started' });
  }
  return true;
});

async function startMessageCollection() {
  if (isScrolling) {
    console.log('Already collecting messages...');
    showNotification('Already running! Please wait...', 'error');
    return;
  }

  console.log('=== Discord DM Downloader Started ===');
  isScrolling = true;
  messages = [];
  let wakeLock = null;

  try {
    // Request wake lock to keep screen awake
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('Screen wake lock activated');
        showNotification('Screen will stay awake during download...', 'info');
      } catch (err) {
        console.log('Wake lock request failed:', err);
      }
    }

    // Show notification
    showNotification('Starting message collection...', 'info');
    console.log('Step 1: Starting...');

    // Scroll to load all messages AND collect them as we go
    console.log('Step 2: Scrolling and collecting messages...');
    await scrollAndCollect();

    if (messages.length === 0) {
      showNotification('No messages collected! Check console for errors.', 'error');
      console.error('No messages were collected. Check the extractMessageData function.');
      return;
    }

    // Remove duplicates (same message ID)
    const uniqueMessages = [];
    const seenIds = new Set();
    messages.forEach(msg => {
      const msgId = `${msg.username}-${msg.timestamp}-${msg.messageText.substring(0, 50)}`;
      if (!seenIds.has(msgId)) {
        seenIds.add(msgId);
        uniqueMessages.push(msg);
      }
    });

    console.log(`Removed ${messages.length - uniqueMessages.length} duplicate messages`);
    messages = uniqueMessages;

    // Sort messages chronologically by timestamp (oldest first)
    console.log('Sorting messages chronologically...');
    messages.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB; // Ascending order (oldest first)
    });
    console.log('Messages sorted from oldest to newest');

    // Generate and download HTML
    console.log('Step 3: Generating HTML...');
    const html = generateHTML();

    console.log('Step 4: Downloading file...');
    downloadHTML(html);

    showNotification(`Downloaded ${messages.length} messages successfully!`, 'success');
    console.log(`=== Download Complete: ${messages.length} messages ===`);
  } catch (error) {
    console.error('Error during message collection:', error);
    showNotification(`Error: ${error.message}`, 'error');
  } finally {
    // Release wake lock
    if (wakeLock !== null) {
      try {
        await wakeLock.release();
        console.log('Screen wake lock released');
      } catch (err) {
        console.log('Wake lock release failed:', err);
      }
    }
    isScrolling = false;
  }
}

async function scrollAndCollect() {
  console.log('=== Starting scroll and collect ===');

  // Try to find the scrollable container
  const messageContainer = getMessageContainer();
  if (!messageContainer) {
    const error = 'Could not find message container. Make sure you are in a DM.';
    console.error(error);
    showNotification(error, 'error');
    throw new Error('Message container not found');
  }

  console.log('Found message container:', messageContainer);

  let scrollAttempts = 0;
  let noChangeCount = 0;
  const maxScrollAttempts = 50000; // Extremely high limit for very long conversations
  const maxNoChange = 30; // Very patient - 30 attempts with no new messages

  const collectedMessageIds = new Set();
  const avatarCache = new Map(); // Cache avatars by username

  showNotification('Starting to load message history...', 'info');

  while (scrollAttempts < maxScrollAttempts && noChangeCount < maxNoChange) {
    scrollAttempts++;

    // Collect currently visible messages BEFORE scrolling
    const currentElements = document.querySelectorAll('li[id^="chat-messages-"]');
    let newMessagesThisRound = 0;

    currentElements.forEach((element) => {
      const messageId = element.id;
      if (!collectedMessageIds.has(messageId)) {
        try {
          const messageData = extractMessageData(element, avatarCache);
          if (messageData) {
            // Cache the avatar for this username if we found one
            if (messageData.avatarUrl && messageData.username !== 'Unknown User') {
              avatarCache.set(messageData.username, messageData.avatarUrl);
            }
            messages.push(messageData);
            collectedMessageIds.add(messageId);
            newMessagesThisRound++;
          }
        } catch (error) {
          console.error('Error extracting message:', error);
        }
      }
    });

    if (newMessagesThisRound > 0) {
      console.log(`✓ Collected ${newMessagesThisRound} new messages (total: ${messages.length}, scroll attempt: ${scrollAttempts})`);
      noChangeCount = 0;

      // Update notification more frequently
      if (messages.length % 50 === 0 || newMessagesThisRound > 5) {
        showNotification(`Collected ${messages.length} messages...`, 'info');
      }
    } else {
      noChangeCount++;
      if (noChangeCount % 5 === 0) {
        console.log(`No new messages found (${noChangeCount}/${maxNoChange} consecutive attempts)`);
      }
    }

    // Scroll to load more - try multiple methods
    const firstMessage = document.querySelector('li[id^="chat-messages-"]');
    if (firstMessage) {
      firstMessage.scrollIntoView({ block: 'start', behavior: 'auto' });
    }

    // Wait longer to ensure Discord loads messages
    await sleep(1200); // Slowed down for more reliable loading

    // Try aggressive techniques more often when stuck
    if (noChangeCount > 0 && noChangeCount % 3 === 0) {
      messageContainer.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }));
      await sleep(400);
    }

    // Extra aggressive when really stuck
    if (noChangeCount > 10 && noChangeCount % 5 === 0) {
      console.log('Extra aggressive loading attempt...');
      messageContainer.scrollTop = Math.max(0, messageContainer.scrollTop - 1000);
      await sleep(700);
    }
  }

  const finalMessage = noChangeCount >= maxNoChange
    ? `Reached start of conversation! ${messages.length} messages collected.`
    : `Collected ${messages.length} messages.`;

  console.log(`=== Collection complete: ${finalMessage} ===`);
  showNotification(finalMessage, 'success');
}

function getMessageContainer() {
  // Discord's message container selectors (may need updates if Discord changes their structure)
  const selectors = [
    '[class*="messagesWrapper"]',
    '[class*="scrollerInner"]',
    'main [class*="scroller"]',
    '[data-list-id="chat-messages"]'
  ];

  for (const selector of selectors) {
    const container = document.querySelector(selector);
    if (container) {
      // Find the scrollable parent
      let element = container;
      while (element && element !== document.body) {
        if (element.scrollHeight > element.clientHeight) {
          return element;
        }
        element = element.parentElement;
      }
      return container;
    }
  }

  return null;
}

function collectMessages() {
  // Try multiple Discord message selectors
  const selectors = [
    'li[id^="chat-messages-"]',
    '[class*="message_"][class*="cozy"]',
    '[class^="message-"]',
    'div[id^="message-content-"]',
    'ol[data-list-id="chat-messages"] > li'
  ];

  let messageElements = [];

  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`Found ${elements.length} messages with selector: ${selector}`);
      messageElements = elements;
      break;
    }
  }

  if (messageElements.length === 0) {
    console.error('Could not find any messages. Trying broader search...');
    // Fallback: find all list items in the main content area
    messageElements = document.querySelectorAll('main li, [role="list"] > li, ol > li');
    console.log(`Fallback found ${messageElements.length} potential message elements`);
  }

  let skippedCount = 0;
  messageElements.forEach((msgElement, index) => {
    try {
      const messageData = extractMessageData(msgElement);
      if (messageData) {
        messages.push(messageData);
      } else {
        skippedCount++;
        if (index < 3) {
          console.log('Skipped message element (no content found):', msgElement);
        }
      }
    } catch (error) {
      console.error('Error extracting message:', error, msgElement);
    }
  });

  console.log(`Collected ${messages.length} messages (skipped ${skippedCount})`);
  if (messages.length === 0) {
    showNotification('No messages found. See console for debug info.', 'error');
    console.log('Available elements:', document.querySelectorAll('li').length, 'li elements found');
    console.log('Please open an issue with your Discord version/layout');
  }
}

function extractMessageData(element, avatarCache = new Map()) {
  // Try multiple selectors for username - be more specific
  let username = 'Unknown User';

  // First, try to find the h3 header which contains the actual message author
  const headerElement = element.querySelector('h3[class*="header"]');
  if (headerElement) {
    // Look for username specifically within the header, not nested elements
    const usernameSpan = headerElement.querySelector('span[class*="username"]:not([class*="repliedTextUsername"])');
    if (usernameSpan && usernameSpan.textContent.trim()) {
      username = usernameSpan.textContent.trim();
    } else {
      // Fallback: get first child text of h3, which is usually the username
      const firstChild = Array.from(headerElement.childNodes).find(node =>
        node.nodeType === Node.ELEMENT_NODE && node.textContent.trim()
      );
      if (firstChild) {
        const text = firstChild.textContent.trim();
        // Remove timestamp if it's in the same element
        username = text.split(/\s*—\s*/)[0].trim();
      }
    }
  }

  // If still no username, try other selectors
  if (username === 'Unknown User') {
    const usernameSelectors = [
      'h3 > span[class*="username"]:first-of-type',
      '[class*="headerText"] > span[class*="username"]:first-child',
      'span[class*="username"]:not([class*="repliedText"])'
    ];

    for (const selector of usernameSelectors) {
      const usernameElement = element.querySelector(selector);
      if (usernameElement && usernameElement.textContent.trim()) {
        username = usernameElement.textContent.trim();
        break;
      }
    }
  }

  // SPECIAL CASE: For grouped messages without headers, look at previous sibling
  if (username === 'Unknown User') {
    let prevElement = element.previousElementSibling;
    while (prevElement) {
      const prevHeader = prevElement.querySelector('h3[class*="header"]');
      if (prevHeader) {
        const prevUsername = prevHeader.querySelector('span[class*="username"]:not([class*="repliedTextUsername"])');
        if (prevUsername && prevUsername.textContent.trim()) {
          username = prevUsername.textContent.trim();
          break;
        }
      }
      prevElement = prevElement.previousElementSibling;
    }
  }

  // Extract timestamp with multiple attempts
  let timestamp = new Date().toISOString();
  const timestampElement = element.querySelector('time');
  if (timestampElement) {
    timestamp = timestampElement.getAttribute('datetime') || timestampElement.textContent;
  } else {
    // Try aria-label timestamp
    const ariaTime = element.querySelector('[aria-label*=":"]');
    if (ariaTime) {
      timestamp = ariaTime.getAttribute('aria-label') || timestamp;
    }
  }

  // Extract message content with multiple selectors
  let messageText = '';
  const contentSelectors = [
    '[id^="message-content-"]',
    '[class*="messageContent"]',
    '[class*="markup"]',
    'div[class*="content"] > div',
    '[class*="message"] [class*="content"]'
  ];

  for (const selector of contentSelectors) {
    const messageContentElement = element.querySelector(selector);
    if (messageContentElement && messageContentElement.textContent.trim()) {
      messageText = messageContentElement.textContent.trim();
      break;
    }
  }

  // Fallback: if we still don't have message text, try to get it from the entire element
  // but exclude username and timestamp text
  if (!messageText && element.textContent.trim()) {
    const tempDiv = element.cloneNode(true);

    // Remove username elements
    tempDiv.querySelectorAll('[class*="username"], h3, time, [class*="timestamp"]').forEach(el => el.remove());

    // Get remaining text
    const fallbackText = tempDiv.textContent.trim();
    if (fallbackText && fallbackText.length > 0) {
      messageText = fallbackText;
      console.log('Used fallback extraction for message text');
    }
  }

  // Extract avatar with multiple attempts
  let avatarUrl = '';

  // Try to find the avatar in the message header area
  const avatarSelectors = [
    'img[class*="avatar"]:not([class*="decoration"])',
    'img[src*="/avatars/"]',
    'img[class*="Avatar"]:not([class*="decoration"])',
    'div[class*="avatar"] img',
    'a[class*="avatar"] img'
  ];

  for (const selector of avatarSelectors) {
    const avatarElement = element.querySelector(selector);
    if (avatarElement && avatarElement.src && avatarElement.src.includes('avatars')) {
      avatarUrl = avatarElement.src;
      break;
    }
  }

  // If no avatar found, try to get any profile image from the message
  if (!avatarUrl) {
    const allImages = element.querySelectorAll('img');
    for (const img of allImages) {
      if (img.src && img.src.includes('cdn.discordapp.com/avatars')) {
        // Make sure it's not a decoration or badge
        const classList = img.classList.toString().toLowerCase();
        if (!classList.includes('decoration') && !classList.includes('badge')) {
          avatarUrl = img.src;
          break;
        }
      }
    }
  }

  // If still no avatar, use cached avatar for this username
  if (!avatarUrl && username !== 'Unknown User' && avatarCache.has(username)) {
    avatarUrl = avatarCache.get(username);
  }

  // If still no avatar, look in previous sibling messages for this user's avatar
  if (!avatarUrl && username !== 'Unknown User') {
    let prevElement = element.previousElementSibling;
    let attempts = 0;
    while (prevElement && attempts < 10) {
      const prevHeader = prevElement.querySelector('h3[class*="header"]');
      if (prevHeader) {
        const prevUsername = prevHeader.querySelector('span[class*="username"]:not([class*="repliedTextUsername"])');
        if (prevUsername && prevUsername.textContent.trim() === username) {
          // Same user, try to get their avatar
          for (const selector of avatarSelectors) {
            const prevAvatar = prevElement.querySelector(selector);
            if (prevAvatar && prevAvatar.src && prevAvatar.src.includes('avatars')) {
              avatarUrl = prevAvatar.src;
              break;
            }
          }
          if (avatarUrl) break;
        } else if (prevUsername) {
          // Different user, stop searching
          break;
        }
      }
      prevElement = prevElement.previousElementSibling;
      attempts++;
    }
  }

  // Extract attachments (images, videos, files)
  const attachments = [];

  // Images
  const imageElements = element.querySelectorAll('img[src*="media.discordapp"], img[src*="cdn.discordapp"], [class*="imageWrapper"] img, [class*="imageContainer"] img');
  imageElements.forEach(img => {
    // Skip avatars
    if (!img.src.includes('avatars') && !img.classList.toString().includes('avatar')) {
      attachments.push({
        type: 'image',
        url: img.src,
        alt: img.alt || 'Image attachment'
      });
    }
  });

  // Videos
  const videoElements = element.querySelectorAll('video');
  videoElements.forEach(video => {
    if (video.src) {
      attachments.push({
        type: 'video',
        url: video.src,
        alt: 'Video attachment'
      });
    }
  });

  // File attachments
  const fileElements = element.querySelectorAll('a[href*="cdn.discordapp"], a[href*="media.discordapp"], [class*="attachment"] a');
  fileElements.forEach(link => {
    if (link.href && !attachments.some(a => a.url === link.href)) {
      attachments.push({
        type: 'file',
        url: link.href,
        alt: link.textContent || 'File attachment'
      });
    }
  });

  // Extract embeds
  const embeds = [];
  const embedElements = element.querySelectorAll('[class*="embed"]');
  embedElements.forEach(embed => {
    const embedTitle = embed.querySelector('[class*="embedTitle"], [class*="title"]');
    const embedDescription = embed.querySelector('[class*="embedDescription"], [class*="description"]');
    const embedUrl = embed.querySelector('a');

    if (embedTitle || embedDescription) {
      embeds.push({
        title: embedTitle ? embedTitle.textContent : '',
        description: embedDescription ? embedDescription.textContent : '',
        url: embedUrl ? embedUrl.href : ''
      });
    }
  });

  // Debug: log extraction results for first few messages
  const elementIndex = Array.from(element.parentNode?.children || []).indexOf(element);
  if (elementIndex < 3) {
    console.log(`Message ${elementIndex} extraction:`, {
      username,
      timestamp,
      messageTextLength: messageText.length,
      messagePreview: messageText.substring(0, 50),
      avatarUrl: avatarUrl ? 'found' : 'missing',
      attachments: attachments.length,
      embeds: embeds.length
    });
  }

  // Debug: log if we found something but it's incomplete
  if (element.textContent.length > 10 && !messageText) {
    console.log('Found element with text but could not extract message content:', element);
  }

  // Skip if no content at all
  if (!messageText && attachments.length === 0 && embeds.length === 0) {
    return null;
  }

  return {
    username,
    timestamp,
    messageText,
    avatarUrl,
    attachments,
    embeds
  };
}

function generateHTML() {
  const conversationName = getConversationName();
  const now = new Date().toLocaleString();

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Discord DM - ${conversationName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #36393f;
      color: #dcddde;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background-color: #2f3136;
      border-radius: 8px;
      overflow: hidden;
    }
    .header {
      background-color: #202225;
      padding: 20px;
      border-bottom: 1px solid #1e1f22;
    }
    .header h1 {
      color: #ffffff;
      font-size: 24px;
      margin-bottom: 10px;
    }
    .header .info {
      color: #b9bbbe;
      font-size: 14px;
    }
    .messages {
      padding: 20px;
    }
    .message {
      display: flex;
      margin-bottom: 20px;
      padding: 10px;
      border-radius: 4px;
    }
    .message:hover {
      background-color: #32353b;
    }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      margin-right: 16px;
      flex-shrink: 0;
      background-color: #5865f2;
    }
    .message-content {
      flex: 1;
    }
    .message-header {
      display: flex;
      align-items: baseline;
      margin-bottom: 4px;
    }
    .username {
      font-weight: 600;
      color: #ffffff;
      margin-right: 8px;
    }
    .timestamp {
      font-size: 12px;
      color: #72767d;
    }
    .message-text {
      color: #dcddde;
      line-height: 1.4;
      word-wrap: break-word;
      white-space: pre-wrap;
    }
    .attachments {
      margin-top: 10px;
    }
    .attachment {
      margin-bottom: 10px;
    }
    .attachment img {
      max-width: 400px;
      max-height: 300px;
      border-radius: 4px;
      cursor: pointer;
    }
    .attachment video {
      max-width: 400px;
      border-radius: 4px;
    }
    .attachment a {
      color: #00b0f4;
      text-decoration: none;
    }
    .attachment a:hover {
      text-decoration: underline;
    }
    .embed {
      border-left: 4px solid #5865f2;
      background-color: #2f3136;
      padding: 10px 12px;
      margin-top: 10px;
      border-radius: 4px;
    }
    .embed-title {
      color: #00b0f4;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .embed-description {
      color: #dcddde;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Discord Direct Messages</h1>
      <div class="info">
        <strong>Conversation:</strong> ${conversationName}<br>
        <strong>Downloaded:</strong> ${now}<br>
        <strong>Total Messages:</strong> ${messages.length}
      </div>
    </div>
    <div class="messages">
`;

  messages.forEach(msg => {
    const date = new Date(msg.timestamp);
    const formattedTime = date.toLocaleString();

    html += `
      <div class="message">
        <img src="${msg.avatarUrl || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22%3E%3Crect fill=%22%235865f2%22 width=%2240%22 height=%2240%22/%3E%3C/svg%3E'}" alt="${msg.username}" class="avatar">
        <div class="message-content">
          <div class="message-header">
            <span class="username">${escapeHtml(msg.username)}</span>
            <span class="timestamp">${formattedTime}</span>
          </div>
          <div class="message-text">${escapeHtml(msg.messageText)}</div>
`;

    if (msg.attachments.length > 0) {
      html += `<div class="attachments">`;
      msg.attachments.forEach(attachment => {
        if (attachment.type === 'image') {
          html += `<div class="attachment"><img src="${attachment.url}" alt="${escapeHtml(attachment.alt)}"></div>`;
        } else if (attachment.type === 'video') {
          html += `<div class="attachment"><video src="${attachment.url}" controls></video></div>`;
        } else {
          html += `<div class="attachment"><a href="${attachment.url}" target="_blank">${escapeHtml(attachment.alt)}</a></div>`;
        }
      });
      html += `</div>`;
    }

    if (msg.embeds.length > 0) {
      msg.embeds.forEach(embed => {
        html += `<div class="embed">`;
        if (embed.title) {
          html += `<div class="embed-title">${escapeHtml(embed.title)}</div>`;
        }
        if (embed.description) {
          html += `<div class="embed-description">${escapeHtml(embed.description)}</div>`;
        }
        html += `</div>`;
      });
    }

    html += `
        </div>
      </div>
`;
  });

  html += `
    </div>
  </div>
</body>
</html>`;

  return html;
}

function getConversationName() {
  // Try to get the DM conversation name
  const nameElement = document.querySelector('[class*="title-"]');
  return nameElement ? nameElement.textContent.trim() : 'Unknown';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function downloadHTML(html) {
  try {
    console.log('=== DOWNLOAD FUNCTION CALLED ===');
    console.log('HTML size:', html.length, 'characters');

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    console.log('Blob created:', blob.size, 'bytes');

    const url = URL.createObjectURL(blob);
    console.log('Blob URL:', url);

    const filename = `discord-dm-${getConversationName()}-${Date.now()}.html`;
    console.log('Filename:', filename);

    // Method 1: Try Chrome downloads API first
    if (chrome && chrome.downloads) {
      console.log('Trying chrome.downloads API...');
      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Chrome downloads API error:', chrome.runtime.lastError);
          fallbackDownload(url, filename);
        } else {
          console.log('Download started with ID:', downloadId);
        }
      });
    } else {
      console.log('Chrome downloads API not available, using fallback...');
      fallbackDownload(url, filename);
    }

  } catch (error) {
    console.error('Error during download:', error);
    showNotification(`Download failed: ${error.message}`, 'error');
  }
}

function fallbackDownload(url, filename) {
  console.log('Using fallback download method...');
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';

    document.body.appendChild(a);
    console.log('Download link created and added to page');

    // Force click with multiple methods
    a.click();
    console.log('Download link clicked');

    // Also try dispatching a click event
    const clickEvent = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true
    });
    a.dispatchEvent(clickEvent);
    console.log('Click event dispatched');

    // Clean up
    setTimeout(() => {
      if (a.parentNode) {
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);
      console.log('Cleanup complete');
    }, 1000);

  } catch (fallbackError) {
    console.error('Fallback download failed:', fallbackError);

    // Last resort: open in new window
    try {
      console.log('Attempting to open in new window...');
      const newWindow = window.open('', '_blank');
      newWindow.document.write(url);
      newWindow.document.close();
      showNotification('Opened in new tab. Right-click and Save As to download.', 'info');
    } catch (e) {
      console.error('All download methods failed:', e);
      showNotification('Download failed. Check browser console.', 'error');
    }
  }
}

function showNotification(message, type = 'info') {
  // Remove existing notification
  const existing = document.getElementById('discord-dm-downloader-notification');
  if (existing) {
    existing.remove();
  }

  const notification = document.createElement('div');
  notification.id = 'discord-dm-downloader-notification';
  notification.textContent = message;

  const colors = {
    info: '#5865f2',
    success: '#3ba55c',
    error: '#ed4245'
  };

  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    backgroundColor: colors[type] || colors.info,
    color: 'white',
    padding: '16px 20px',
    borderRadius: '8px',
    zIndex: '10000',
    fontFamily: 'Arial, sans-serif',
    fontSize: '14px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    maxWidth: '300px'
  });

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 5000);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

} // End of window.discordDMDownloaderLoaded check
