export type Role = 'user' | 'assistant';
export type Message = { id: string; role: Role; content: string; image?: string; actions?: string[] };
export type Chat = { id: string; title: string; mode: 'chat' | 'roleplay'; messages: Message[]; updatedAt: number };
export type RPState = { inventory: string[]; location: string; health: number; gold: number };