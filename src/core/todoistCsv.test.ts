import { describe, expect, it } from "vitest";
import { parseCsv, parseTodoistCsv, projectNameFromFile } from "./todoistCsv";

const NOW = new Date(2026, 8, 26, 10, 0);
const CSV = `TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,DURATION,DURATION_UNIT,DEADLINE,DEADLINE_LANG
meta,view_style=list,,,,,,,,,,,,
task,Inbox zero @admin,,4,1,Me (1),,every weekday,en,Europe/London,,,,
section,Planning,,,,,,,,,,,,
task,"Write the brief, v2 @writing @deep_work","Keep it ""short""
two lines",1,1,Me (1),,tomorrow 9am,en,,45,minute,oct 5,en
task,Outline,,2,2,Me (1),,,en,,,,,
note,Remember the appendix,,,,,,,,,,,,
task,Book venue,,3,1,Me (1),,,en,,,,,
`;

describe("Todoist CSV import", () => {
  it("parses quoted fields with commas, quotes and newlines", () => {
    const rows = parseCsv('a,"b, c","say ""hi""\nthere"\n1,2,3');
    expect(rows).toEqual([
      ["a", "b, c", 'say "hi"\nthere'],
      ["1", "2", "3"],
    ]);
  });
  it("names the project from the export's file name", () => {
    expect(projectNameFromFile("Work [2203306141].csv")).toBe("Work");
  });
  it("reads tasks, sections, sub-tasks, notes, dates and durations", () => {
    const p = parseTodoistCsv(CSV, "Work", { now: NOW });
    expect(p.sections).toEqual(["Planning"]);
    expect(p.tasks.map((t) => t.title)).toEqual(["Inbox zero", "Write the brief, v2", "Outline", "Book venue"]);
    const [inbox, brief, outline, venue] = p.tasks;
    expect(inbox!.recurrence).toBe("every weekday");
    expect(inbox!.section).toBeNull();
    expect(inbox!.priority).toBe(4);
    expect(brief!.labels).toEqual(["writing", "deep work"]);
    expect(brief!.priority).toBe(1);
    expect(brief!.notes).toBe('Keep it "short"\ntwo lines');
    expect(brief!.due?.startsWith("2026-09-27T09:00")).toBe(true);
    expect(brief!.duration).toBe(45);
    expect(brief!.deadline).toBe("2026-10-05");
    expect(brief!.section).toBe("Planning");
    expect(outline!.parent).toBe(1);
    expect(outline!.notes).toBe("Remember the appendix");
    expect(venue!.parent).toBeNull();
  });
  it("can flip API-style priorities", () => {
    expect(parseTodoistCsv(CSV, "Work", { now: NOW, apiPriorities: true }).tasks[1]!.priority).toBe(4);
  });
});
