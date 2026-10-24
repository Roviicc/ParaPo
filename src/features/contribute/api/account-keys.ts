export const accountKeys = {
  all: ['account'] as const,
  session: () => [...accountKeys.all, 'session'] as const,
  profile: () => [...accountKeys.all, 'profile'] as const,
  uploads: () => [...accountKeys.all, 'uploads'] as const,
};
