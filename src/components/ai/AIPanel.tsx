import { useRef, useState, useEffect } from 'react';
import { Sparkles, X, Send, Copy, Check } from 'lucide-react';
import { askAI, type ChatMessage } from '../../lib/ai';

const SUGGESTIONS = [
  'Summarise this month’s rent collection',
  'Which leases are expiring soon?',
  'Draft a rent reminder notice',
  'What are my biggest arrears?',
];

export function AIPanel({ open, onClose, seed }: { open: boolean; onClose: () => void; seed?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // When opened from Universal Search with a query, send it once.
  const lastSeed = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (open && seed && seed !== lastSeed.current) {
      lastSeed.current = seed;
      void send(seed);
    }
    if (!open) lastSeed.current = undefined;
  }, [open, seed]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setInput('');
    setBusy(true);
    const res = await askAI(next, { module: 'executive_assistant' });
    setMessages([...next, { role: 'assistant', content: res.reply ?? res.error ?? 'No response.' }]);
    setBusy(false);
  };

  const copy = (text: string, i: number) => {
    navigator.clipboard.writeText(text);
    setCopied(i);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-96 flex-col border-l border-[#1C1C34] bg-[#0E0E1C] shadow-2xl transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ width: '24rem' }}
        aria-hidden={!open}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-[#1C1C34] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--accent-glow)', color: 'var(--accent-light)' }}>
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="font-display text-sm font-semibold text-white">Executive Assistant</p>
              <p className="text-[10px] text-[#5A5A78]">NegoLinks Intelligence Engine</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5" aria-label="Close assistant">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* messages */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="pt-6 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: 'var(--accent-glow)', color: 'var(--accent-light)' }}>
                <Sparkles className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm font-medium text-white">How can I help?</p>
              <p className="mt-1 text-xs text-[#A0A0B8]">Ask about your portfolio, finances, or draft a document.</p>
              <div className="mt-5 space-y-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}
                    className="block w-full rounded-lg border border-[#1C1C34] bg-[#131325] px-3 py-2 text-left text-xs text-[#CBD5E1] hover:border-[var(--accent-border)]">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`group relative max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${m.role === 'user' ? 'text-white' : 'bg-[#131325] text-[#E4E4EF]'}`}
                  style={m.role === 'user' ? { background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-deep))' } : undefined}>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  {m.role === 'assistant' && (
                    <button onClick={() => copy(m.content, i)} className="absolute -bottom-2 -right-2 rounded-md border border-[#1C1C34] bg-[#0E0E1C] p-1 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100" aria-label="Copy">
                      {copied === i ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-[#131325] px-4 py-3">
                <span className="flex gap-1">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent-light)]" style={{ animationDelay: `${d * 150}ms` }} />
                  ))}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* input */}
        <div className="border-t border-[#1C1C34] p-3">
          <div className="flex items-end gap-2 rounded-xl border border-[#1C1C34] bg-[#131325] p-2">
            <textarea
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              rows={1} placeholder="Ask the assistant…" disabled={busy}
              className="max-h-28 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm text-white placeholder:text-[#5A5A78] focus:outline-none"
            />
            <button onClick={() => send(input)} disabled={busy || !input.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white disabled:opacity-40"
              style={{ background: 'var(--accent-primary)' }} aria-label="Send">
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-[#5A5A78]">Powered by NegoLinks Intelligence Engine</p>
        </div>
      </aside>
    </>
  );
}
