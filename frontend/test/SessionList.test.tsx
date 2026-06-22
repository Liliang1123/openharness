import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SessionList } from "../src/SessionList";
import type { SessionMeta } from "../src/api";

const sessions: SessionMeta[] = [
  { conversationId: "c1", title: "First session", updatedAt: "2026-05-25T10:00:00Z" },
  { conversationId: "c2", title: "Second session", updatedAt: "2026-05-25T11:00:00Z" }
];

describe("SessionList", () => {
  it("renders all sessions with title", () => {
    render(
      <SessionList
        sessions={sessions}
        activeId={null}
        onSelect={() => {}}
        onNew={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByText("First session")).toBeTruthy();
    expect(screen.getByText("Second session")).toBeTruthy();
  });

  it("shows empty state when no sessions", () => {
    render(
      <SessionList
        sessions={[]}
        activeId={null}
        onSelect={() => {}}
        onNew={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByText("No sessions yet")).toBeTruthy();
  });

  it("highlights active session", () => {
    const { container } = render(
      <SessionList
        sessions={sessions}
        activeId="c2"
        onSelect={() => {}}
        onNew={() => {}}
        onDelete={() => {}}
      />
    );
    const activeItem = container.querySelector(".session-item.active");
    expect(activeItem).toBeTruthy();
    expect(activeItem?.textContent).toContain("Second session");
  });

  it("calls onSelect when a session is clicked", async () => {
    const onSelect = vi.fn();
    render(
      <SessionList
        sessions={sessions}
        activeId={null}
        onSelect={onSelect}
        onNew={() => {}}
        onDelete={() => {}}
      />
    );
    await userEvent.click(screen.getByText("First session"));
    expect(onSelect).toHaveBeenCalledWith("c1");
  });

  it("calls onNew when '+ New' clicked", async () => {
    const onNew = vi.fn();
    render(
      <SessionList
        sessions={sessions}
        activeId={null}
        onSelect={() => {}}
        onNew={onNew}
        onDelete={() => {}}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "+ New" }));
    expect(onNew).toHaveBeenCalled();
  });

  it("calls onDelete after confirmation", async () => {
    const onDelete = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <SessionList
        sessions={sessions}
        activeId={null}
        onSelect={() => {}}
        onNew={() => {}}
        onDelete={onDelete}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete session First session" }));
    expect(onDelete).toHaveBeenCalledWith("c1");

    confirmSpy.mockRestore();
  });

  it("does not call onDelete when confirmation is cancelled", async () => {
    const onDelete = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <SessionList
        sessions={sessions}
        activeId={null}
        onSelect={() => {}}
        onNew={() => {}}
        onDelete={onDelete}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete session First session" }));
    expect(onDelete).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});
