import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AiAssistantClient from "./ui";
const first="10000000-0000-4000-8000-000000000001", second="10000000-0000-4000-8000-000000000002";
const fetchMock=vi.fn();
beforeEach(() => {
 Element.prototype.scrollIntoView=vi.fn();
 fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
  let data: unknown = {reservedMyr:1};
  if (options?.method === "POST") data={conversationId:first,historySaved:true,answer:"Fresh answer",capturedAt:"2026-10-15T03:30:00Z",sources:[],usage:{reservedMyr:1.5}};
  else if (url.includes(`conversationId=${first}`)) data={turns:[{question:"Saved question",answer:"Saved answer",captured_at:"2026-10-13T08:00:00Z"}]};
  else if (url.includes(`conversationId=${second}`)) data={turns:[{question:"Older question",answer:"Older answer",captured_at:"2026-10-12T08:00:00Z"}]};
  else if (url.includes("/history")) data={conversations:[{id:first,title:"Recent chat",updated_at:"2026-10-15T03:30:00Z"},{id:second,title:"Older chat",updated_at:"2026-10-12T08:00:00Z"}]};
  return {ok:true,json:async()=>data};
 });
 vi.stubGlobal("fetch",fetchMock);
});
afterEach(() => {vi.unstubAllGlobals();vi.clearAllMocks();});
it("restores the most recent saved chat and snapshot after a fresh mount", async () => {
 const view=render(<AiAssistantClient/>); expect(await screen.findByText("Saved answer")).toBeInTheDocument();
 expect(screen.getByText(/13\/10\/2026/)).toBeInTheDocument();
 view.unmount(); render(<AiAssistantClient/>);expect(await screen.findByText("Saved question")).toBeInTheDocument();
});
it("opens old chats, continues their conversation, and starts a new chat without deleting history", async () => {
 render(<AiAssistantClient/>);await screen.findByText("Saved answer");
 fireEvent.click(screen.getByRole("button",{name:/Older chat/}));await screen.findByText("Older answer");
 fireEvent.change(screen.getByRole("textbox",{name:"Ask AI"}),{target:{value:"Follow up"}});fireEvent.click(screen.getByRole("button",{name:"Send"}));
 await screen.findByText("Fresh answer");
 const post=fetchMock.mock.calls.find(call=>call[1]?.method==="POST");expect(JSON.parse(post?.[1]?.body as string).conversationId).toBe(second);
 await waitFor(()=>expect(screen.getByRole("button",{name:"New chat"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"New chat"}));
 expect(screen.queryByText("Fresh answer")).toBeNull();expect(screen.getByRole("button",{name:/Older chat/})).toBeInTheDocument();
});
