import { Member, CustomDay, DrivingPlan } from './carpool';
import { PartyRef } from '@/lib/dayPlanActions';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Compact human-readable summary of state changes applied by this turn. */
  diffSummary?: string[];
  reverted?: boolean;
  /** members/plan state right before this turn's actions were applied, kept for revert. */
  snapshot?: { members: Member[]; plan: DrivingPlan | null };
}

export type AssistantStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'tool_call'; name: string }
  | { type: 'final'; reply: string; actions: AssistantAction[] }
  | { type: 'error'; message: string };

export type AssistantAction =
  | { type: 'createMember'; member: Member }
  | { type: 'updateMember'; initials: string; member: Member }
  | { type: 'deleteMember'; initials: string }
  | { type: 'importMembers'; members: Member[] }
  | { type: 'exportMembers' }
  | { type: 'updateCustomDay'; initials: string; dayKey: string; customDay: CustomDay }
  | { type: 'movePassenger'; dayUniqueNumber: number; passenger: string; fromParty: PartyRef; toParty: PartyRef }
  | { type: 'deletePlan' }
  | { type: 'exportPlan' }
  | { type: 'navigate'; path: string };
