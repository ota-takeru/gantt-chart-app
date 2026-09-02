import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createFixtureTaskApi } from "./api/fixtureTaskApi";

function loadedStyles(): string {
  return Array.from(document.styleSheets).map((sheet) => {
    try { return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n"); } catch { return ""; }
  }).join("\n");
}

async function ready() {
  await screen.findByRole("heading", { name: "NOW 残っている仕事" });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Issue #29 sticky task creation bar", () => {
  it("keeps the task form at the top edge and places the ruler below it", async () => {
    render(<App api={createFixtureTaskApi("typical")} />);
    await ready();

    const header = document.querySelector<HTMLElement>(".compact-topline");
    const ruler = document.querySelector<HTMLElement>(".timeline-ruler");
    const formInput = screen.getByRole("textbox", { name: "新しいタスク" });
    expect(header).toBeInTheDocument();
    expect(ruler).toBeInTheDocument();
    expect(formInput).toBeInTheDocument();
    expect(header?.contains(formInput)).toBe(true);

    const styles = loadedStyles();
    const headerRule = styles.match(/\.compact-topline \{[^}]+\}/)?.[0] ?? "";
    const rulerRule = Array.from(styles.matchAll(/\.timeline-ruler \{[^}]+\}/g)).find((match) => match[0].includes("position: sticky"))?.[0] ?? "";
    const targetRule = styles.match(/\.history-surface,[^}]+scroll-margin-top: var\(--sticky-scroll-offset\);[^}]*\}/)?.[0] ?? "";
    expect(headerRule).toContain("position: sticky");
    expect(headerRule).toMatch(/top: 0(?:px)?/);
    expect(headerRule).toContain("z-index: 20");
    expect(headerRule).toContain("background: var(--paper)");
    expect(rulerRule).toContain("position: sticky");
    expect(rulerRule).toContain("top: var(--compact-topline-height)");
    expect(rulerRule).toContain("scroll-margin-top: var(--sticky-scroll-offset)");
    expect(targetRule).toContain("scroll-margin-top: var(--sticky-scroll-offset)");
  });

  it("uses measured header and ruler heights, and updates offsets without rerendering domain state", async () => {
    let headerHeight = 74;
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const rect = originalGetBoundingClientRect.call(this);
      if (this.classList.contains("compact-topline")) return { ...rect, height: headerHeight } as DOMRect;
      if (this.classList.contains("timeline-ruler")) return { ...rect, height: 49 } as DOMRect;
      return rect;
    });
    const observerCallbacks: ResizeObserverCallback[] = [];
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) {
        observerCallbacks.push(callback);
      }
      observe() { /* The test drives the callback below. */ }
      disconnect() { /* no-op */ }
    });

    render(<App api={createFixtureTaskApi("typical")} />);
    await ready();

    const surface = document.querySelector<HTMLElement>(".work-surface");
    expect(surface).toBeInTheDocument();
    expect(surface?.style.getPropertyValue("--compact-topline-height")).toBe("74px");
    expect(surface?.style.getPropertyValue("--timeline-ruler-height")).toBe("49px");

    headerHeight = 86;
    observerCallbacks.at(-1)?.([], {} as ResizeObserver);
    expect(surface?.style.getPropertyValue("--compact-topline-height")).toBe("86px");
    expect(getBoundingClientRect).toHaveBeenCalled();
  });

  it("keeps the add control focusable through a scroll event and uses the combined jump margin", async () => {
    render(<App api={createFixtureTaskApi("dense")} />);
    await ready();

    const formInput = screen.getByRole("textbox", { name: "新しいタスク" });
    formInput.focus();
    fireEvent.scroll(window);
    expect(document.activeElement).toBe(formInput);

    const target = document.querySelector<HTMLElement>("[id^=\"history-task-\"]");
    expect(target).toBeInTheDocument();
    const styles = loadedStyles();
    expect(styles).toContain("--sticky-scroll-offset: calc(var(--compact-topline-height) + var(--timeline-ruler-height))");
    expect(styles).toMatch(/\.history-surface,[^}]+\.history-row,[^}]+\{[^}]*scroll-margin-top: var\(--sticky-scroll-offset\);/);
  });
});
