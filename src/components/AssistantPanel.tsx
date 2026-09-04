import { useEffect, useRef, useState } from 'react';
import { X, Send, Undo2, Bot, Eraser } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { ChatMessage } from '@/types/assistant';

interface AssistantPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onRevert: (messageId: string) => void;
  onClear: () => void;
  isSending: boolean;
  streamingReply: string;
  thinkingText: string;
  toolActivity: string[];
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
}

const MIN_WIDTH = 300;
const MAX_WIDTH = 720;

export function AssistantPanel({
  messages,
  onSend,
  onRevert,
  onClear,
  isSending,
  streamingReply,
  thinkingText,
  toolActivity,
  width,
  onWidthChange,
  onClose,
}: AssistantPanelProps) {
  const [draft, setDraft] = useState('');
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef(false);
  const hasScrolledOnOpenRef = useRef(false);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: hasScrolledOnOpenRef.current ? 'smooth' : 'auto' });
    hasScrolledOnOpenRef.current = true;
  }, [messages, isSending]);

  const handleClear = () => {
    onClear();
    setClearConfirmOpen(false);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const next = window.innerWidth - moveEvent.clientX;
      onWidthChange(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)));
    };
    const onMouseUp = () => {
      resizingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleSend = () => {
    if (!draft.trim() || isSending) return;
    onSend(draft);
    setDraft('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="relative flex-shrink-0 border-l border-border bg-card flex flex-col h-screen sticky top-0"
      style={{ width }}
    >
      <div
        onMouseDown={handleResizeStart}
        className="absolute left-0 top-0 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-10"
        title="Drag to resize"
      />

      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Assistant</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setClearConfirmOpen(true)}
            disabled={messages.length === 0}
            aria-label="Clear chat history"
            title="Clear chat history"
          >
            <Eraser className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close assistant chat" title="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear chat history?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all messages in this conversation and let you start from scratch. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClear} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              How may I help you today?
            </p>
          )}
          {messages.map((message) => (
            <div key={message.id} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[90%] rounded-lg px-3 py-2 text-sm',
                  message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                )}
              >
                <div
                  className={cn(
                    'prose prose-chat prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-pre:my-1 prose-headings:my-1.5',
                    message.role === 'user' ? 'prose-on-primary' : 'dark:prose-invert'
                  )}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                </div>
                {message.diffSummary && message.diffSummary.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                    {message.diffSummary.map((line, idx) => (
                      <p
                        key={idx}
                        className={cn(
                          'text-xs font-mono text-muted-foreground whitespace-pre-wrap',
                          /^\[.+\]$/.test(line) && 'font-semibold text-foreground'
                        )}
                      >
                        {line || ' '}
                      </p>
                    ))}
                    {message.snapshot && !message.reverted && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 mt-1 gap-1.5 text-xs"
                        onClick={() => onRevert(message.id)}
                      >
                        <Undo2 className="h-3 w-3" />
                        Revert
                      </Button>
                    )}
                    {message.reverted && (
                      <p className="text-xs text-muted-foreground italic">Reverted</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isSending && (
            <div className="flex justify-start">
              <div className="max-w-[90%] rounded-lg px-3 py-2 text-sm bg-muted text-foreground">
                {streamingReply ? (
                  <div className="prose prose-chat prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-pre:my-1 prose-headings:my-1.5 dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingReply}</ReactMarkdown>
                  </div>
                ) : toolActivity.length > 0 || thinkingText ? (
                  <div className="space-y-1">
                    {toolActivity.map((name, idx) => (
                      <p key={idx} className="text-xs text-muted-foreground italic">
                        Using tool: {name}…
                      </p>
                    ))}
                    {thinkingText && (
                      <p className="text-xs text-muted-foreground italic line-clamp-2">
                        {thinkingText.slice(-200)}
                      </p>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">Thinking…</span>
                )}
              </div>
            </div>
          )}
          <div ref={scrollEndRef} />
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border flex-shrink-0 flex items-center gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the assistant..."
          rows={2}
          className="min-h-0 resize-none text-sm"
        />
        <Button size="icon" onClick={handleSend} disabled={!draft.trim() || isSending} aria-label="Send message">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
