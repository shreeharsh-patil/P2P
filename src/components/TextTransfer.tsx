import React, { useState } from 'react';
import { Send, Copy, Check, Clipboard } from 'lucide-react';

export interface TextMessageItem {
  id: string;
  sender: 'me' | 'peer';
  text: string;
  timestamp: number;
}

interface TextTransferProps {
  messages: TextMessageItem[];
  isConnected: boolean;
  onSendText: (text: string) => void;
}

export const TextTransfer: React.FC<TextTransferProps> = ({
  messages,
  isConnected,
  onSendText
}) => {
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && isConnected) {
      onSendText(inputText.trim());
      setInputText('');
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputText(text);
      }
    } catch (e) {
      console.warn('Clipboard read error', e);
    }
  };

  const recent = messages.slice(-10).reverse();

  return (
    <div className="tech-panel p-5 bg-[#09090b] border border-[#1c1c22] space-y-4 font-mono">
      <div className="text-xs text-[#8a8a8a] tracking-[0.25em] uppercase flex items-center justify-between">
        <span>// TEXT CHANNEL</span>
        {isConnected && (
          <button
            type="button"
            onClick={handlePasteClipboard}
            className="text-[10px] text-[#ff2b2b] hover:underline flex items-center gap-1 font-mono uppercase tracking-wider"
            title="Paste from clipboard"
          >
            <Clipboard className="w-3 h-3" />
            Paste Clipboard
          </button>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={isConnected ? 'Type or paste a message...' : 'Awaiting peer connection'}
          disabled={!isConnected}
          className="flex-1 bg-[#050505] border border-[#1c1c22] focus:border-[#ff2b2b] rounded-sm px-3 py-2 text-xs text-[#f2f2f2] placeholder:text-[#4a4a4a] focus:outline-none disabled:opacity-40 transition-colors font-mono"
        />
        <button
          type="submit"
          disabled={!isConnected || !inputText.trim()}
          className="px-4 py-2 bg-[#ff2b2b] hover:bg-[#e51b23] disabled:opacity-40 text-white rounded-sm font-mono font-bold text-xs flex items-center gap-1.5 transition-colors uppercase tracking-wider active:scale-95"
        >
          <Send className="w-3.5 h-3.5" />
          Send
        </button>
      </form>

      {/* Messages */}
      {recent.length === 0 ? (
        <div className="p-4 bg-[#050505] border border-[#18181c] rounded-xs text-center text-xs text-[#4a4a4a]">
          NO MESSAGES YET — Send a message to your peer.
        </div>
      ) : (
        <div className="pt-2 border-t border-[#1c1c22] space-y-3">
          <div className="text-[10px] text-[#4a4a4a] tracking-[0.2em] uppercase">
            // RECENT MESSAGES
          </div>

          {recent.map((msg) => (
            <div key={msg.id} className="p-2.5 bg-[#050505] border border-[#18181c] rounded-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${msg.sender === 'me' ? 'text-[#ff2b2b]' : 'text-emerald-400'}`}>
                  {msg.sender === 'me' ? 'YOU' : 'REMOTE PEER'}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-[#4a4a4a]">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button
                    onClick={() => handleCopy(msg.id, msg.text)}
                    className="p-0.5 text-[#8a8a8a] hover:text-[#f2f2f2] transition-colors"
                    title="Copy text"
                  >
                    {copiedId === msg.id ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
              <p className="text-xs text-[#f2f2f2] whitespace-pre-wrap break-words">
                {msg.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
