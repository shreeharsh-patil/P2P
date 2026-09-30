export const normalizeTextMessageLineEndings = (text: string): string => {
  return text.replace(/\r\n?/g, '\n');
};

/**
 * Prepare chat text for transport without changing its visual structure.
 *
 * We only normalize platform-specific CRLF/CR line endings to LF. Leading
 * spaces, indentation, blank lines, tabs, and trailing whitespace are kept so
 * copied chat messages, lists, code, and paragraphs arrive exactly as shared.
 */
export const prepareTextMessage = (text: string): string | null => {
  const normalized = normalizeTextMessageLineEndings(text);
  return normalized.trim().length > 0 ? normalized : null;
};
