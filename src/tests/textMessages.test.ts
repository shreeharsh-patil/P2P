import { describe, expect, it } from 'vitest';
import { normalizeTextMessageLineEndings, prepareTextMessage } from '../utils/textMessages';

describe('text message formatting', () => {
  it('preserves multiline chat layout, indentation and blank lines', () => {
    const message = 'Heading\n\n- first item\n- second item\n\n  indented line\nhttps://example.com/a/b?x=1&y=2';

    expect(prepareTextMessage(message)).toBe(message);
  });

  it('normalizes Windows and legacy CR line endings without flattening content', () => {
    expect(normalizeTextMessageLineEndings('one\r\ntwo\rthree')).toBe('one\ntwo\nthree');
  });

  it('does not strip meaningful leading or trailing formatting', () => {
    const message = '  code block\n    nested line\n';

    expect(prepareTextMessage(message)).toBe(message);
  });

  it('rejects messages containing only whitespace', () => {
    expect(prepareTextMessage('  \n\t\n ')).toBeNull();
  });
});
