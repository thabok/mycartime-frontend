import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AssistantFabProps {
  onClick: () => void;
}

export function AssistantFab({ onClick }: AssistantFabProps) {
  return (
    <Button
      onClick={onClick}
      size="icon"
      className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg"
      title="Ask the assistant"
      aria-label="Open assistant chat"
    >
      <Bot className="h-5 w-5" />
    </Button>
  );
}
