/**
 * The job the client described in «Co trzeba zrobić?» on the home page
 * (21.11.2026), carried to the next steps of the same visit: the master's
 * services that fit it are marked, and the text pre-fills «Opisz, co trzeba
 * zrobić» so the client doesn't say it twice. Kept in module memory only —
 * a personal description isn't stored on the device.
 */

export type TaskDraft = { text: string; serviceIds: string[] };

let draft: TaskDraft | null = null;

export function setTaskDraft(next: TaskDraft | null): void {
  draft = next;
}

export function taskDraft(): TaskDraft | null {
  return draft;
}
