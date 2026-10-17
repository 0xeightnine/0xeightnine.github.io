import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const username = '0xeightnine';
const outputPath = new URL('./github-status.json', import.meta.url);

function decodeHtml(value) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([\da-f]+);/gi, (_, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 16)))
    .replace(/&#(\d+);/g, (_, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

export function parseProfileStatus(html) {
  if (!html.includes(`/${username}"`) || !html.includes('vcard-username')) {
    throw new Error(`GitHub did not return the ${username} profile page`);
  }

  const emojiMatch = html.match(
    /class="user-status-emoji-container[^"]*"[^>]*>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/,
  );
  const messageMatch = html.match(
    /class="user-status-message-wrapper[^"]*"[^>]*>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/,
  );

  if (!emojiMatch || !messageMatch) {
    return { username, emoji: null, message: null };
  }

  const emoji = decodeHtml(emojiMatch[1]);
  const message = decodeHtml(messageMatch[1]);

  if (!emoji || !message) {
    return { username, emoji: null, message: null };
  }

  return { username, emoji, message };
}

async function main() {
  const response = await fetch(`https://github.com/${username}`, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'pi-teams-github-status-updater',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`GitHub profile request failed with status ${response.status}`);
  }

  const nextStatus = parseProfileStatus(await response.text());
  let previousStatus = null;

  try {
    previousStatus = JSON.parse(await readFile(outputPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  if (
    previousStatus?.updatedAt
    && previousStatus?.username === nextStatus.username
    && previousStatus?.emoji === nextStatus.emoji
    && previousStatus?.message === nextStatus.message
  ) {
    console.log('GitHub status has not changed.');
    return;
  }

  await writeFile(outputPath, `${JSON.stringify({
    ...nextStatus,
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`);
  console.log(`Updated GitHub status to ${nextStatus.emoji || '(no emoji)'} ${nextStatus.message || '(no status)'}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Unable to update GitHub status:', error);
    process.exitCode = 1;
  });
}
