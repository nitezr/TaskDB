import { describe, expect, it } from "vitest";
import { plainPreview, toggleChecklistLine } from "./markdown";

describe("markdown helpers", () => {
  it("strips syntax for the one-line row preview", () => {
    expect(plainPreview("# Plan\n- **Book** the [venue](https://x.com)\n- [ ] Send `invite`")).toBe("Plan · Book the venue · Send invite");
  });
  it("ticks and unticks a checklist line", () => {
    const src = "Steps\n- [ ] one\n- [x] two";
    expect(toggleChecklistLine(src, 1)).toBe("Steps\n- [x] one\n- [x] two");
    expect(toggleChecklistLine(src, 2)).toBe("Steps\n- [ ] one\n- [ ] two");
    expect(toggleChecklistLine(src, 0)).toBe(src);
  });
});
