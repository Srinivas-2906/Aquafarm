export const UserRole = {
  OWNER: 'OWNER',
  SUPERVISOR: 'SUPERVISOR',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];
