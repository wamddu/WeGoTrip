import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { repository } from "../data/repository";
import type { Command, Session, Workspace } from "../domain/models";

type TravelContext = {
  session: Session | null;
  data: Workspace | null;
  loading: boolean;
  busy: boolean;
  error: string;
  mode: "mock" | "http";
  sampleEmail?: string;
  refresh(): Promise<void>;
  authenticate(
    name: string | null,
    email: string,
    password?: string,
  ): Promise<void>;
  signOut(): Promise<void>;
  execute(command: Command): Promise<Workspace>;
};
const Context = createContext<TravelContext | null>(null);
export function TravelProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    if (lock.current) return;
    const requestRevision = ++revision.current;
    setError("");
    try {
      const next = await repository.load();
      if (revision.current === requestRevision) setData(next);
    } catch (e) {
      if (revision.current === requestRevision)
        setError(
          e instanceof Error ? e.message : "데이터를 불러오지 못했어요.",
        );
    }
  }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await repository.restoreSession();
        if (!active) return;
        setSession(saved);
        if (saved) {
          const next = await repository.load();
          if (active) setData(next);
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "저장 데이터를 읽지 못했어요.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  async function authenticate(
    name: string | null,
    email: string,
    password?: string,
  ) {
    revision.current++;
    const nextSession =
      name === null
        ? await repository.signIn(email, password)
        : await repository.signUp(name, email, password);
    const nextData = await repository.load();
    setSession(nextSession);
    setData(nextData);
    setError("");
  }
  async function execute(command: Command) {
    if (lock.current)
      throw new Error("이전 저장을 마친 뒤 다시 시도해 주세요.");
    lock.current = true;
    revision.current++;
    setBusy(true);
    try {
      const next = await repository.execute(command);
      setData(next);
      return next;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function signOut() {
    if (lock.current) throw new Error("저장이 끝난 후 로그아웃해 주세요.");
    lock.current = true;
    revision.current++;
    setBusy(true);
    try {
      await repository.signOut();
    } finally {
      setSession(null);
      setData(null);
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Context.Provider
      value={{
        session,
        data,
        loading,
        busy,
        error,
        mode: repository.mode,
        sampleEmail: repository.sampleEmail,
        refresh,
        authenticate,
        signOut,
        execute,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useTravel() {
  const context = useContext(Context);
  if (!context) throw new Error("TravelProvider is missing");
  return context;
}
