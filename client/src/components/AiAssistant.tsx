import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askAssistant } from "@/lib/assistant.functions";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = ["Recommend a course", "Reset password", "Talk to support"];

export function AiAssistant() {
  const ask = useServerFn(askAssistant);
  const [open, setOpen] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "HTS Assistant here. Ask about navigation, your courses, or anything that is not working.",
    },
  ]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  async function send(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: value }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const { reply } = await ask({
        data: { messages: next.filter((m) => m.content).slice(-20) },
      });
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch {
      setError("The assistant is unavailable right now. Try again, or escalate to support.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-3 border-2 border-ink bg-ink px-4 py-3 text-[11px] font-bold uppercase tracking-[0.15em] text-paper"
      >
        <span className="grid size-6 place-items-center bg-clay font-black text-paper">AI</span>
        Ask HTS
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 flex h-[520px] w-[min(94vw,380px)] flex-col border-2 border-ink bg-paper">
      <div className="flex items-center gap-3 border-b-2 border-ink px-4 py-3">
        <span className="grid size-8 place-items-center bg-clay font-black text-paper">AI</span>
        <div className="flex-1">
          <div className="text-sm font-black">HTS Assistant</div>
          <div className="mono-xs text-fog">Always on</div>
        </div>
        <button onClick={() => setOpen(false)} className="font-mono text-xs text-ink/60">
          Close
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] border-2 border-ink bg-ink px-3 py-2 text-[13px] text-paper"
                  : "max-w-[92%] text-[13px] leading-relaxed text-ink"
              }
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && <div className="font-mono text-[11px] text-fog">Thinking…</div>}
        {error && <div className="font-mono text-[11px] text-clay">{error}</div>}
        {escalated && (
          <div className="border border-ink/20 bg-sand p-2 font-mono text-[11px] text-ink/70">
            Escalated to human support. A specialist replies to {`amara.osei@meridian.study`} within
            one working day.
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-ink/15 px-4 py-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            className="border border-ink/20 px-2 py-1 font-mono text-[10px] text-ink/70"
          >
            {s}
          </button>
        ))}
        <button
          onClick={() => setEscalated(true)}
          className="border border-clay px-2 py-1 font-mono text-[10px] text-clay"
        >
          Escalate to human
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-end gap-2 border-t-2 border-ink p-3"
      >
        <textarea
          ref={inputRef}
          value={input}
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder="Ask anything…"
          className="min-w-0 flex-1 resize-none border border-ink/25 bg-paper px-2 py-1.5 text-[13px] outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="bg-ink px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-paper disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
