# Discord DM Downloader

A Chrome extension to download Discord direct message history in HTML format with automatic scrolling.

## Features

- Downloads all messages from a Discord DM conversation
- Automatically scrolls to load entire message history
- Exports to formatted HTML file
- Includes:
  - Message text
  - Timestamps
  - User avatars
  - Sender information
  - Images and media attachments
  - Video attachments
  - File attachments
  - Embedded content

## Installation

1. Download or clone this folder to your computer
2. Create placeholder icons (or add your own):
   - Create `icon16.png` (16x16 pixels)
   - Create `icon48.png` (48x48 pixels)
   - Create `icon128.png` (128x128 pixels)
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" (toggle in top right)
5. Click "Load unpacked"
6. Select the folder containing these files
7. The extension should now appear in your extensions list

## Usage

1. Open Discord in your browser (discord.com)
2. Navigate to the DM conversation you want to download
3. Click the Discord DM Downloader extension icon in your toolbar
4. Click "Download DM History"
5. Wait for the extension to automatically scroll and load all messages
6. The HTML file will download automatically when complete

## Notes

- The extension needs to scroll to the top of your conversation to load all messages
- This may take some time for very long conversations
- Progress notifications will appear on the page
- The downloaded HTML file includes Discord-like styling for easy reading
- Media files are linked (not embedded), so you need an internet connection to view images/videos

## Troubleshooting

- Make sure you're on a Discord DM page before clicking download
- If the extension can't find messages, Discord may have updated their HTML structure
- Check the browser console (F12) for any error messages
- Ensure you have the latest version of Chrome

## Privacy

- This extension only runs on discord.com domains
- All processing happens locally in your browser
- No data is sent to any external servers
- Downloaded files are saved directly to your computer
