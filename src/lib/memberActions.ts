import { Member } from '@/types/carpool';

// Shared by the Members panel UI and the AI assistant's action runner so
// both apply the exact same mutation semantics.

export function sortMembers(membersList: Member[]): Member[] {
  return [...membersList].sort((a, b) => {
    const lastNameCompare = a.lastName.localeCompare(b.lastName);
    if (lastNameCompare !== 0) return lastNameCompare;
    return a.firstName.localeCompare(b.firstName);
  });
}

export function applyCreateMember(members: Member[], member: Member): Member[] {
  return sortMembers([...members, member]);
}

export function applyUpdateMember(members: Member[], shorthand: string, member: Member): Member[] {
  return sortMembers(members.map(m => (m.shorthand === shorthand ? member : m)));
}

export function applyDeleteMember(members: Member[], shorthand: string): Member[] {
  return members.filter(m => m.shorthand !== shorthand);
}

export function applyImportMembers(_members: Member[], imported: Member[]): Member[] {
  return sortMembers(imported);
}
