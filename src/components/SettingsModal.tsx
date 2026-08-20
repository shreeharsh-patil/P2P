import React from 'react';
import { X, Settings, Cpu, HardDrive, Volume2, Zap } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chunkSize: number;
  onChunkSizeChange: (size: number) => void;
  preferDirectSave: boolean;
  onPreferDirectSaveChange: (val: boolean) => void;
  autoAcceptFiles: boolean;
  onAutoAcceptFilesChange: (val: boolean) => void;
  soundEnabled: boolean;
  onSoundToggle: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  chunkSize,
  onChunkSizeChange,
  preferDirectSave,
  onPreferDirectSaveChange,
  autoAcceptFiles,
  onAutoAcceptFilesChange,
  soundEnabled,
  onSoundToggle
}) => {
  if (!isOpen) return null;

  const chunkSizes = [
    { label: '16 KB', value: 16 * 1024 },
    { label: '32 KB', value: 32 * 1024 },
    { label: '60 KB (Recommended)', value: 60 * 1024 }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <div className="tech-panel p-6 max-w-md w-full relative bg-[#09090b] border border-[#ff2b2b]/50 shadow-[0_0_30px_rgba(255,43,43,0.15)] font-mono space-y-5">
        <div className="flex items-center justify-between border-b border-[#1c1c22] pb-3">
          <div className="flex items-center gap-2 text-[#ff2b2b]">
            <Settings className="w-5 h-5" />
            <h3 className="text-sm font-bold text-[#f2f2f2] tracking-wide">Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#8a8a8a] hover:text-white rounded-xs transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chunk Size Selector */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#8a8a8a] flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#ff2b2b]" />
            Chunk size
          </label>
          <div className="grid grid-cols-1 gap-2">
            {chunkSizes.map((item) => (
              <button
                key={item.value}
                onClick={() => onChunkSizeChange(item.value)}
                className={`py-2 px-3 text-xs font-mono rounded-xs border text-left transition-all ${
                  chunkSize === item.value
                    ? 'bg-[#180a0c] border-[#ff2b2b] text-[#ff2b2b] font-bold'
                    : 'bg-[#050505] border-[#1c1c22] text-[#8a8a8a] hover:border-[#26262e]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Storage Strategy Toggle */}
        <div className="space-y-2 pt-3 border-t border-[#1c1c22]">
          <label className="text-xs font-bold text-[#8a8a8a] flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-emerald-400" />
            Save strategy
          </label>
          <div
            onClick={() => onPreferDirectSaveChange(!preferDirectSave)}
            className="p-3 bg-[#050505] rounded-xs border border-[#1c1c22] flex items-center justify-between cursor-pointer hover:border-[#26262e] transition-colors"
          >
            <div>
              <div className="text-xs font-bold text-[#f2f2f2]">Use native file picker</div>
              <div className="text-[10px] text-[#8a8a8a]">Prompts save dialog for large files</div>
            </div>
            <input
              type="checkbox"
              checked={preferDirectSave}
              onChange={() => {}}
              className="accent-[#ff2b2b] w-4 h-4"
            />
          </div>
        </div>

        {/* Auto-Accept Files Toggle */}
        <div className="space-y-2 pt-3 border-t border-[#1c1c22]">
          <label className="text-xs font-bold text-[#8a8a8a] flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#ff2b2b]" />
            Auto-accept transfers
          </label>
          <div
            onClick={() => onAutoAcceptFilesChange(!autoAcceptFiles)}
            className="p-3 bg-[#050505] rounded-xs border border-[#1c1c22] flex items-center justify-between cursor-pointer hover:border-[#26262e] transition-colors"
          >
            <div>
              <div className="text-xs font-bold text-[#f2f2f2]">Auto-accept incoming files</div>
              <div className="text-[10px] text-[#8a8a8a]">Automatically start downloading when peer sends files</div>
            </div>
            <input
              type="checkbox"
              checked={autoAcceptFiles}
              onChange={() => {}}
              className="accent-[#ff2b2b] w-4 h-4"
            />
          </div>
        </div>

        {/* Audio Toggle */}
        <div className="space-y-2 pt-3 border-t border-[#1c1c22]">
          <div
            onClick={onSoundToggle}
            className="p-3 bg-[#050505] rounded-xs border border-[#1c1c22] flex items-center justify-between cursor-pointer hover:border-[#26262e] transition-colors"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-[#f2f2f2]">
              <Volume2 className="w-4 h-4 text-[#ff2b2b]" />
              <span>Sound effects</span>
            </div>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={() => {}}
              className="accent-[#ff2b2b] w-4 h-4"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
