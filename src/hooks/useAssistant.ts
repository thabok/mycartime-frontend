import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DayOfWeekABCombo, Member, DrivingPlan } from '@/types/carpool';
import { AssistantAction, AssistantStreamEvent, ChatMessage } from '@/types/assistant';
import { useSessionStorage } from './useSessionStorage';
import { useLocalStorage } from './useLocalStorage';
import { applyCreateMember, applyDeleteMember, applyImportMembers, applyUpdateMember } from '@/lib/memberActions';
import { applyTransfers, canTransferPassenger, findDayKeyByUniqueNumber } from '@/lib/dayPlanActions';
import { downloadJson } from '@/lib/utils';

interface UseAssistantArgs {
  members: Member[];
  onMembersChange: (members: Member[]) => void;
  plan: DrivingPlan | null;
  onPlanChange: (plan: DrivingPlan | null) => void;
}

const memberLabel = (member: Member) => `${member.firstName} (${member.initials})`;

function formatTime(value: number): string {
  const padded = String(value).padStart(4, '0');
  return `${padded.slice(0, -2)}:${padded.slice(-2)}`;
}

function dayLabel(combo: DayOfWeekABCombo): string {
  const day = combo.dayOfWeek;
  const capitalized = day.charAt(0) + day.slice(1).toLowerCase();
  return `${capitalized}-${combo.isWeekA ? 'A' : 'B'}`;
}

function describeAction(action: AssistantAction, membersBefore: Member[]): string {
  switch (action.type) {
    case 'createMember':
      return `+ Added ${memberLabel(action.member)}`;
    case 'updateMember':
      return `~ Updated ${memberLabel(action.member)}`;
    case 'deleteMember': {
      const existing = membersBefore.find(m => m.initials === action.initials);
      return `- Removed ${existing ? memberLabel(existing) : action.initials}`;
    }
    case 'importMembers':
      return `Imported ${action.members.length} members (replaced the list)`;
    case 'exportMembers':
      return 'Exported members to JSON';
    case 'updateCustomDay': {
      const existing = membersBefore.find(m => m.initials === action.initials);
      return `~ Updated custom preferences for ${existing ? memberLabel(existing) : action.initials} (day ${action.dayKey})`;
    }
    case 'movePassenger':
      return `Moved ${action.passenger} from ${action.fromParty.driver}[${action.fromParty.time}] to ${action.toParty.driver}[${action.toParty.time}]`;
    case 'deletePlan':
      return 'Discarded the driving plan';
    case 'exportPlan':
      return 'Exported the driving plan to JSON';
    case 'navigate':
      return `Navigated to ${action.path}`;
    default:
      return 'Unknown action';
  }
}

export function useAssistant({ members, onMembersChange, plan, onPlanChange }: UseAssistantArgs) {
  const [messages, setMessages] = useSessionStorage<ChatMessage[]>('carpool-assistant-messages', []);
  const [isOpen, setIsOpen] = useLocalStorage('carpool-assistant-open', false);
  const [width, setWidth] = useLocalStorage('carpool-assistant-width', 420);
  const [isSending, setIsSending] = useState(false);
  const [streamingReply, setStreamingReply] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed };
    const history = [...messages, userMessage];
    setMessages(history);
    setStreamingReply('');
    setIsSending(true);

    try {
      const backendHostAndPort = `http://${window.location.hostname}:1338`;
      const response = await fetch(`${backendHostAndPort}/api/v1/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map(m => ({ role: m.role, content: m.content })),
          context: {
            members,
            plan,
            uiContext: {
              route: `${location.pathname}${location.search}`,
              viewMode: location.pathname.startsWith('/plan') ? 'plan' : 'members',
            },
          },
        }),
      });

      if (!response.ok || !response.body) throw new Error('Assistant request failed');

      let data: { reply: string; actions: AssistantAction[] } | null = null;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        const event: AssistantStreamEvent = JSON.parse(line);
        if (event.type === 'delta') setStreamingReply(prev => prev + event.text);
        else if (event.type === 'final') data = event;
        else if (event.type === 'error') throw new Error(event.message);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) handleLine(line);
      }
      handleLine(buffer);

      if (!data) throw new Error('Assistant stream ended without a final response');

      const snapshot = { members, plan };
      let nextMembers = members;
      let nextPlan = plan;
      let navigateTo: string | null = null;
      const diffSummary: string[] = [];
      let openDayGroup: string | null = null;

      const pushDiffLine = (line: string) => {
        diffSummary.push(line);
        openDayGroup = null;
      };
      const pushDayDiffLine = (label: string, line: string) => {
        if (label !== openDayGroup) {
          if (diffSummary.length > 0) diffSummary.push('');
          diffSummary.push(`[${label}]`);
          openDayGroup = label;
        }
        diffSummary.push(`  ${line}`);
      };

      for (const action of data.actions) {
        switch (action.type) {
          case 'createMember':
            nextMembers = applyCreateMember(nextMembers, action.member);
            pushDiffLine(describeAction(action, nextMembers));
            break;
          case 'updateMember':
            nextMembers = applyUpdateMember(nextMembers, action.initials, action.member);
            pushDiffLine(describeAction(action, nextMembers));
            break;
          case 'deleteMember':
            pushDiffLine(describeAction(action, nextMembers));
            nextMembers = applyDeleteMember(nextMembers, action.initials);
            break;
          case 'importMembers':
            nextMembers = applyImportMembers(nextMembers, action.members);
            pushDiffLine(describeAction(action, nextMembers));
            break;
          case 'updateCustomDay':
            pushDiffLine(describeAction(action, nextMembers));
            nextMembers = nextMembers.map(m =>
              m.initials === action.initials
                ? { ...m, customDays: { ...m.customDays, [action.dayKey]: action.customDay } }
                : m
            );
            break;
          case 'movePassenger': {
            if (!nextPlan) break;
            const dayKey = findDayKeyByUniqueNumber(nextPlan, action.dayUniqueNumber);
            const dayPlan = dayKey ? nextPlan.dayPlans[dayKey] : undefined;
            if (!dayPlan || !canTransferPassenger(dayPlan, action)) break;
            const label = dayLabel(dayPlan.dayOfWeekABCombo);
            // A driver has one party per direction per day with the same `driver`
            // initials, so times must be compared within the move's own direction
            // (schoolbound/homebound) — otherwise this conflates the two parties.
            const schoolbound = dayPlan.parties.find(
              p => p.driver === action.fromParty.driver && p.time === action.fromParty.time
            )?.schoolbound;
            const timesBeforeByDriver = new Map(
              dayPlan.parties.filter(p => p.schoolbound === schoolbound).map(p => [p.driver, p.time])
            );
            nextPlan = applyTransfers(nextPlan, action.dayUniqueNumber, [action]);
            pushDayDiffLine(label, describeAction(action, nextMembers));
            const updatedParties = nextPlan.dayPlans[dayKey!].parties;
            for (const driver of [action.fromParty.driver, action.toParty.driver]) {
              const before = timesBeforeByDriver.get(driver);
              const after = updatedParties.find(p => p.driver === driver && p.schoolbound === schoolbound)?.time;
              if (before !== undefined && after !== undefined && before !== after) {
                pushDayDiffLine(label, `Note: ${driver}'s party time changed from ${formatTime(before)} to ${formatTime(after)}`);
              }
            }
            break;
          }
          case 'deletePlan':
            nextPlan = null;
            pushDiffLine(describeAction(action, nextMembers));
            break;
          case 'exportMembers':
            downloadJson('carpool-members.json', nextMembers);
            pushDiffLine(describeAction(action, nextMembers));
            break;
          case 'exportPlan':
            if (nextPlan) downloadJson('driving-plan.json', nextPlan);
            pushDiffLine(describeAction(action, nextMembers));
            break;
          case 'navigate':
            navigateTo = action.path;
            pushDiffLine(describeAction(action, nextMembers));
            break;
        }
      }

      const membersChanged = nextMembers !== members;
      const planChanged = nextPlan !== plan;

      if (membersChanged) onMembersChange(nextMembers);
      if (planChanged) onPlanChange(nextPlan);
      if (navigateTo) navigate(navigateTo);

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.reply,
        diffSummary: diffSummary.length > 0 ? diffSummary : undefined,
        snapshot: membersChanged || planChanged ? snapshot : undefined,
      };
      setMessages([...history, assistantMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, something went wrong reaching the assistant. Please try again.',
      };
      setMessages([...history, errorMessage]);
    } finally {
      setStreamingReply('');
      setIsSending(false);
    }
  }, [messages, members, plan, isSending, location, navigate, onMembersChange, onPlanChange, setMessages]);

  const revertTurn = useCallback((messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (!message?.snapshot) return;
    onMembersChange(message.snapshot.members);
    onPlanChange(message.snapshot.plan);
    setMessages(messages.map(m => (m.id === messageId ? { ...m, reverted: true } : m)));
  }, [messages, onMembersChange, onPlanChange, setMessages]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  return {
    messages,
    sendMessage,
    revertTurn,
    clearMessages,
    isSending,
    streamingReply,
    isOpen,
    setIsOpen,
    width,
    setWidth,
  };
}
