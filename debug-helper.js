// Debug Helper Script
// Paste this into Discord's browser console (F12) to help identify the correct selectors

console.log('=== Discord Message Structure Debug ===');

// Find all potential message containers
console.log('\n1. Checking for message containers:');
const containerSelectors = [
  '[class*="messagesWrapper"]',
  '[class*="scrollerInner"]',
  'main [class*="scroller"]',
  '[data-list-id="chat-messages"]',
  'ol[class*="scroller"]'
];

containerSelectors.forEach(selector => {
  const found = document.querySelectorAll(selector);
  if (found.length > 0) {
    console.log(`✓ Found ${found.length} elements with: ${selector}`);
  }
});

// Find all potential message elements
console.log('\n2. Checking for message elements:');
const messageSelectors = [
  'li[id^="chat-messages-"]',
  '[class*="message_"][class*="cozy"]',
  '[class^="message-"]',
  'div[id^="message-content-"]',
  'ol[data-list-id="chat-messages"] > li'
];

messageSelectors.forEach(selector => {
  const found = document.querySelectorAll(selector);
  if (found.length > 0) {
    console.log(`✓ Found ${found.length} messages with: ${selector}`);
  }
});

// Inspect first message structure
console.log('\n3. First message structure:');
const allLi = document.querySelectorAll('main li');
if (allLi.length > 0) {
  const firstMsg = allLi[0];
  console.log('First <li> element:', firstMsg);
  console.log('Classes:', firstMsg.className);
  console.log('ID:', firstMsg.id);

  // Check for username
  console.log('\n4. Looking for username in first message:');
  const usernameSelectors = [
    '[class*="username"]',
    'h3',
    '[class*="author"]',
    'span[class*="header"]'
  ];

  usernameSelectors.forEach(selector => {
    const found = firstMsg.querySelector(selector);
    if (found) {
      console.log(`✓ Username selector: ${selector} -> "${found.textContent}"`);
    }
  });

  // Check for message content
  console.log('\n5. Looking for message content:');
  const contentSelectors = [
    '[id^="message-content-"]',
    '[class*="messageContent"]',
    '[class*="markup"]'
  ];

  contentSelectors.forEach(selector => {
    const found = firstMsg.querySelector(selector);
    if (found) {
      console.log(`✓ Content selector: ${selector} -> "${found.textContent.substring(0, 50)}..."`);
    }
  });

  // Check for timestamp
  console.log('\n6. Looking for timestamp:');
  const time = firstMsg.querySelector('time');
  if (time) {
    console.log('✓ Found <time> element:', time.getAttribute('datetime'));
  }

  // Check for avatar
  console.log('\n7. Looking for avatar:');
  const avatars = firstMsg.querySelectorAll('img');
  avatars.forEach((img, i) => {
    console.log(`Image ${i}:`, img.src.substring(0, 80));
  });
}

console.log('\n8. All class names in first 5 messages:');
const first5 = Array.from(allLi).slice(0, 5);
const allClasses = new Set();
first5.forEach(msg => {
  msg.querySelectorAll('*').forEach(el => {
    if (el.className && typeof el.className === 'string') {
      el.className.split(' ').forEach(c => allClasses.add(c));
    }
  });
});

console.log('Unique classes found:', Array.from(allClasses).sort());

console.log('\n=== Debug Complete ===');
console.log('Copy this console output and share it if you need help fixing the selectors.');
