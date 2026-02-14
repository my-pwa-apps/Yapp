/**
 * Client-side content moderation using the LDNOOBW multilingual profanity lists.
 * Source: https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words
 * License: CC-BY-4.0 (Shutterstock, Inc.)
 *
 * Word lists are fetched from GitHub raw content and cached in memory + localStorage.
 */

const BASE_URL =
  'https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master';

/** Languages to load for content filtering */
const LANGUAGES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ar', 'zh', 'ja',
  'ko', 'ru', 'hi', 'tr', 'pl', 'da', 'fi', 'no', 'sv', 'cs',
  'hu', 'th', 'fil',
];

const CACHE_KEY = 'yapp_profanity_cache';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

/** In-memory word set for fast lookups */
let wordSet: Set<string> | null = null;
let loadingPromise: Promise<Set<string>> | null = null;

interface CacheData {
  words: string[];
  timestamp: number;
}

function loadFromLocalStorage(): Set<string> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data: CacheData = JSON.parse(raw);
    if (Date.now() - data.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return new Set(data.words);
  } catch {
    return null;
  }
}

function saveToLocalStorage(words: Set<string>): void {
  try {
    const data: CacheData = {
      words: Array.from(words),
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // localStorage might be full or unavailable — ignore
  }
}

async function fetchLanguageWords(lang: string): Promise<string[]> {
  try {
    const res = await fetch(`${BASE_URL}/${lang}`);
    if (!res.ok) return [];
    const text = await res.text();
    return text
      .split('\n')
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 0);
  } catch {
    return [];
  }
}

/**
 * Load all profanity word lists. Returns the cached set if already loaded,
 * otherwise fetches from GitHub (with localStorage caching).
 */
export async function loadProfanityList(): Promise<Set<string>> {
  if (wordSet) return wordSet;

  // Check localStorage cache
  const cached = loadFromLocalStorage();
  if (cached) {
    wordSet = cached;
    return wordSet;
  }

  // Prevent duplicate fetches
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const allWords = new Set<string>();
    const results = await Promise.allSettled(
      LANGUAGES.map((lang) => fetchLanguageWords(lang)),
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const word of result.value) {
          allWords.add(word);
        }
      }
    }
    wordSet = allWords;
    saveToLocalStorage(allWords);
    loadingPromise = null;
    return allWords;
  })();

  return loadingPromise;
}

/**
 * Check if text contains profanity.
 * Returns an object with `clean` (boolean) and `flaggedWords` (matched words).
 *
 * Uses word-boundary matching for Latin-script languages and
 * substring matching for CJK/non-space-delimited scripts.
 */
export async function checkContent(text: string): Promise<{
  clean: boolean;
  flaggedWords: string[];
}> {
  const words = await loadProfanityList();
  if (words.size === 0) {
    // If lists failed to load, allow content through
    return { clean: true, flaggedWords: [] };
  }

  const normalizedText = text.toLowerCase();
  const flaggedWords: string[] = [];

  for (const badWord of words) {
    if (badWord.length < 2) continue; // Skip single-char entries to avoid false positives

    // Check if the word uses CJK/non-Latin characters (substring match)
    const isCJK = /[\u3000-\u9fff\uac00-\ud7af\u0600-\u06ff\u0e00-\u0e7f]/.test(badWord);

    if (isCJK) {
      if (normalizedText.includes(badWord)) {
        flaggedWords.push(badWord);
      }
    } else {
      // Word-boundary match for Latin-script words
      const escaped = badWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(normalizedText)) {
        flaggedWords.push(badWord);
      }
    }

    // Early exit after first few matches
    if (flaggedWords.length >= 3) break;
  }

  return {
    clean: flaggedWords.length === 0,
    flaggedWords,
  };
}

/**
 * Pre-load the profanity list in background (call on app startup).
 */
export function preloadProfanityList(): void {
  loadProfanityList().catch(() => {});
}
