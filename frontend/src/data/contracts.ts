import type { Command, Session, Workspace } from "../domain/models";
export interface KeyValueStorage {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
export interface TravelRepository {
  readonly mode: "mock" | "http";
  readonly sampleEmail?: string;
  restoreSession(): Promise<Session | null>;
  signIn(email: string, password?: string): Promise<Session>;
  signUp(name: string, email: string, password?: string): Promise<Session>;
  signOut(): Promise<void>;
  load(): Promise<Workspace>;
  execute(command: Command): Promise<Workspace>;
}
