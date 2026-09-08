import { useEffect, useState } from 'react';
import { Bug, ExternalLink, HelpCircle, Lightbulb } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useToast } from '@/hooks/use-toast';
import { getBackendUrl } from '@/lib/config';

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FeedbackLabel = 'bug' | 'question' | 'enhancement';

interface FeedbackDraft {
  title: string;
  description: string;
  label: FeedbackLabel;
}

const EMPTY_DRAFT: FeedbackDraft = { title: '', description: '', label: 'enhancement' };

const OPEN_ISSUES_URL =
  'https://github.com/thabok/mycartime/issues?q=is%3Aissue%20label%3A%22user%20feedback%22%20state%3Aopen';

const LABEL_OPTIONS: { value: FeedbackLabel; text: string; icon: typeof Bug }[] = [
  { value: 'bug', text: 'Bug', icon: Bug },
  { value: 'question', text: 'Question', icon: HelpCircle },
  { value: 'enhancement', text: 'Enhancement', icon: Lightbulb },
];

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const [draft, setDraft] = useLocalStorage<FeedbackDraft>('carpool-feedback-draft', EMPTY_DRAFT);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [label, setLabel] = useState<FeedbackLabel>('bug');
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();
  const backendHostAndPort = getBackendUrl();

  // Reload the saved draft every time the dialog is (re-)opened.
  useEffect(() => {
    if (open) {
      setTitle(draft.title);
      setDescription(draft.description);
      setLabel(draft.label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveDraftAndClose = () => {
    setDraft({ title, description, label });
    onOpenChange(false);
  };

  const discardAndClose = () => {
    setDraft(EMPTY_DRAFT);
    onOpenChange(false);
  };

  const sendFeedback = async () => {
    if (!title.trim()) {
      toast({ title: 'Please add a title', variant: 'destructive' });
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch(`${backendHostAndPort}/api/v1/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), label }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Failed to submit feedback');
      }

      setDraft(EMPTY_DRAFT);
      onOpenChange(false);
      toast({
        title: 'Thanks for your feedback!',
        description: (
          <span>
            Your issue was created on GitHub.{' '}
            <a
              href={OPEN_ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:opacity-80"
            >
              View open issues
              <ExternalLink className="h-3 w-3" />
            </a>
          </span>
        ),
      });
    } catch (error) {
      toast({
        title: 'Could not send feedback',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  // Closing the dialog via the X button, Escape, or an outside click is
  // treated the same as "Come back later" so nothing gets lost by accident.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      saveDraftAndClose();
    } else {
      onOpenChange(next);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="feedback-title">Add a title</Label>
            <Input
              id="feedback-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary of your feedback"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-description">Add a description</Label>
            <Textarea
              id="feedback-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Suggestions, questions, or details about a bug..."
              rows={5}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-type">Type</Label>
            <Select value={label} onValueChange={(value) => setLabel(value as FeedbackLabel)}>
              <SelectTrigger id="feedback-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LABEL_OPTIONS.map(({ value, text, icon: Icon }) => (
                  <SelectItem key={value} value={value}>
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {text}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Your feedback will be submitted as an issue on a public GitHub repository, visible to
            anyone.{' '}
            <a
              href={OPEN_ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
            >
              See open issues
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={saveDraftAndClose} disabled={isSending}>
            Come back later
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={discardAndClose} disabled={isSending}>
              Discard
            </Button>
            <Button onClick={sendFeedback} disabled={isSending}>
              {isSending ? 'Sending...' : 'Send feedback'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
