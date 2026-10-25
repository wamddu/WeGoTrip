import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  ChatApi,
  loadChatUpdates,
  mergeMessages,
  type ChatMessage,
  type PollInput,
} from "../../data/chat-api";
import { ApiError } from "../../data/user-api";
import { requestKey } from "../../data/trip-api";
import { useTrip } from "./trip-context";

type ChatState = ReturnType<typeof useChatRoomState>;
const Context = createContext<ChatState | null>(null);
export function ChatRoomProvider({
  enabled,
  children,
}: PropsWithChildren<{ enabled: boolean }>) {
  const state = useChatRoomState(enabled);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useChatRoom() {
  const context = useContext(Context);
  if (!context) throw new Error("ChatRoomProvider is missing");
  return context;
}
function useChatRoomState(enabled: boolean) {
  const { chatPartyId, pushId } = useLocalSearchParams<{
    chatPartyId?: string;
    pushId?: string;
  }>();
  const { trip, session, userApi } = useTrip();
  const [selectedParty, setPartyId] = useState<string | null>(null);
  useEffect(() => {
    if (pushId)
      setPartyId(
        chatPartyId && /^[1-9]\d{0,18}$/.test(chatPartyId) ? chatPartyId : null,
      );
  }, [chatPartyId, pushId]);
  const [imagesOnly, setImagesOnly] = useState(false);
  const parties =
    trip?.parties.filter((p) => p.memberIds.includes(session?.user.id ?? "")) ??
    [];
  const partyId = parties.some((p) => p.id === selectedParty)
    ? selectedParty
    : null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const tripId = trip?.id;
  const roomKey = `${session?.user.id}:${tripId}:${partyId ?? "all"}`;
  const viewKey = `${roomKey}:${imagesOnly ? "images" : "all"}`;
  const [loadedView, setLoadedView] = useState<string | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const api = useMemo(
    () =>
      userApi && tripId
        ? new ChatApi(userApi, tripId, partyId, imagesOnly)
        : null,
    [userApi, tripId, partyId, imagesOnly],
  );
  const epoch = useRef(0);
  const writeLock = useRef(false);
  const olderLock = useRef(false);
  const pending = useRef(new Map<string, string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current++;
    };
  }, []);
  const accept = useCallback(
    (items: ChatMessage[], generation: number) => {
      if (mounted.current && generation === epoch.current) {
        const visible = imagesOnly
          ? items.filter((item) => item.kind === "IMAGE" && !!item.imageUrl)
          : items;
        if (visible.length)
          setMessages((current) => mergeMessages(current, visible));
      }
    },
    [imagesOnly],
  );

  useEffect(() => {
    const generation = ++epoch.current;
    setMessages([]);
    messagesRef.current = [];
    setCursor(null);
    setError("");
    setConnected(false);
    setLoading(enabled && !!api);
    setLoadedView(viewKey);
    if (!enabled || !api || !userApi || !tripId) return;
    let stopped = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let connecting = false;
    let polling = false;
    let denied = false;
    let attempts = 0;
    let initialized = false;
    let synchronizedHead: string | null = null;
    const valid = () => !stopped && generation === epoch.current;
    function failure(cause: unknown) {
      if (!valid()) return;
      setError(
        cause instanceof Error ? cause.message : "대화를 불러오지 못했어요.",
      );
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
        denied = true;
        setMessages([]);
        setCursor(null);
        socket?.close();
      }
    }
    async function sync() {
      if (polling || !valid() || denied) return;
      polling = true;
      const wasInitial = !initialized;
      try {
        const page = await loadChatUpdates(api!, synchronizedHead, valid);
        if (valid()) {
          accept(page.items, generation);
          synchronizedHead = page.items.at(-1)?.id ?? synchronizedHead ?? "0";
          if (!initialized) {
            setCursor(page.nextCursor);
            initialized = true;
          }
          setError("");
          const recent = new Set(page.items.map((m) => m.id));
          const olderPolls = messagesRef.current.filter(
            (m) => m.poll && !recent.has(m.id),
          );
          await Promise.all(
            olderPolls.map(async (m) => {
              const item = await api!.message(m.id);
              if (valid()) accept([item], generation);
            }),
          );
        }
      } catch (cause) {
        failure(cause);
      } finally {
        polling = false;
        if (valid() && wasInitial) setLoading(false);
      }
    }
    async function connect() {
      if (
        connecting ||
        !valid() ||
        denied ||
        (socket &&
          (socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING)) ||
        AppState.currentState === "background"
      )
        return;
      connecting = true;
      try {
        // HTTP refreshes an expired access token before the subscription frame.
        await sync();
        if (!valid() || denied || !userApi!.token) return;
        const current = new WebSocket(userApi!.chatSocketUrl);
        socket = current;
        const armWatchdog = () => {
          clearTimeout(watchdog);
          watchdog = setTimeout(() => current.close(), 25000);
        };
        armWatchdog();
        current.onopen = () => {
          if (!valid()) {
            current.close();
            return;
          }
          current.send(
            JSON.stringify({
              type: "subscribe",
              token: userApi!.token,
              tripId,
              partyId,
            }),
          );
        };
        current.onmessage = (event) => {
          if (!valid()) return;
          armWatchdog();
          try {
            const message = JSON.parse(String(event.data));
            if (message.type === "ready") {
              setConnected(true);
              attempts = 0;
              // Fetch again after subscribing to close the initial read/subscribe gap.
              void sync();
            } else if (
              message.type === "changed" &&
              typeof message.messageId === "string" &&
              /^[1-9][0-9]*$/.test(message.messageId)
            ) {
              void api!
                .message(message.messageId)
                .then((item) => accept([item], generation))
                .catch(failure);
            }
          } catch {
            current.close();
          }
        };
        current.onerror = () => current.close();
        current.onclose = () => {
          if (socket !== current) return;
          clearTimeout(watchdog);
          if (!valid()) return;
          setConnected(false);
          clearTimeout(retry);
          retry = setTimeout(
            () => void connect(),
            Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)),
          );
        };
      } catch (cause) {
        failure(cause);
        if (valid() && !denied) retry = setTimeout(() => void connect(), 5000);
      } finally {
        connecting = false;
      }
    }
    void connect();
    // Reconcile after outages, and refresh older visible polls as well.
    const fallback = setInterval(() => {
      if (valid() && AppState.currentState !== "background") void sync();
    }, 15000);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        clearTimeout(retry);
        void connect();
        void sync();
      } else {
        clearTimeout(retry);
        socket?.close();
      }
    });
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(watchdog);
      clearInterval(fallback);
      appState.remove();
      socket?.close();
    };
  }, [api, userApi, tripId, partyId, viewKey, enabled, accept]);

  async function older() {
    if (!api || !cursor || loading || olderLock.current) return;
    const generation = epoch.current;
    olderLock.current = true;
    setLoading(true);
    try {
      const page = await api.history(cursor);
      if (generation === epoch.current) {
        accept(page.items, generation);
        setCursor(page.nextCursor);
        setError("");
      }
    } catch (cause) {
      if (generation === epoch.current) setError((cause as Error).message);
    } finally {
      olderLock.current = false;
      if (generation === epoch.current) setLoading(false);
    }
  }
  async function write(action: () => Promise<ChatMessage>) {
    if (writeLock.current) throw new Error("이전 요청을 처리하고 있어요.");
    const generation = epoch.current;
    writeLock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await action();
      accept([result], generation);
      return result;
    } catch (cause) {
      if (generation === epoch.current) setError((cause as Error).message);
      throw cause;
    } finally {
      writeLock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function create(
    kind: "message" | "poll",
    body: { text: string; uploadId: string | null } | PollInput,
  ) {
    if (!api) throw new Error("서버 연결 모드에서 사용할 수 있어요.");
    const signature = JSON.stringify({ roomKey, kind, body });
    const key = pending.current.get(signature) ?? requestKey();
    pending.current.set(signature, key);
    const result = await write(() =>
      kind === "poll"
        ? api.poll(body as PollInput, key)
        : api.send(
            (body as { text: string }).text,
            (body as { uploadId: string | null }).uploadId,
            key,
          ),
    );
    if (pending.current.get(signature) === key)
      pending.current.delete(signature);
    return result;
  }
  return {
    api,
    partyId,
    setPartyId,
    imagesOnly,
    setImagesOnly,
    parties,
    messages: loadedView === viewKey ? messages : [],
    cursor: loadedView === viewKey ? cursor : null,
    loading: loading || loadedView !== viewKey,
    busy,
    error: loadedView === viewKey ? error : "",
    connected: loadedView === viewKey && connected,
    older,
    roomKey,
    send: (text: string, uploadId: string | null) =>
      create("message", { text, uploadId }),
    poll: (input: PollInput) => create("poll", input),
    vote: (id: string, optionId: string | null, selected?: boolean) =>
      write(() => api!.vote(id, optionId, selected)),
    close: (id: string) => write(() => api!.close(id)),
  };
}
