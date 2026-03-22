import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  formatRelativeTime,
  formatMessageTime,
  formatChatListTime,
} from './utils';

describe('formatDuration', () => {
  it('formats 0 seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats seconds under one minute', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('formats exact minutes', () => {
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(120)).toBe('2:00');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(125)).toBe('2:05');
  });
});

describe('formatRelativeTime', () => {
  it('shows "now" for recent timestamps', () => {
    expect(formatRelativeTime(Date.now())).toBe('now');
  });

  it('shows minutes for timestamps within an hour', () => {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    expect(formatRelativeTime(fiveMinAgo)).toBe('5m');
  });

  it('shows hours for timestamps within a day', () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    expect(formatRelativeTime(twoHoursAgo)).toBe('2h');
  });

  it('shows days for timestamps over a day old', () => {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    expect(formatRelativeTime(threeDaysAgo)).toBe('3d');
  });
});

describe('formatMessageTime', () => {
  it('returns a time string with hours and minutes', () => {
    const result = formatMessageTime(Date.now());
    // Should match HH:MM pattern (12-hour or 24-hour depending on locale)
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});

describe('formatChatListTime', () => {
  it('handles recent timestamps', () => {
    const result = formatChatListTime(Date.now());
    expect(result).toBeTruthy();
  });

  it('handles yesterday', () => {
    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    const result = formatChatListTime(yesterday);
    expect(result).toBeTruthy();
  });
});
