"use client";

/**
 * One event chip inside a day column — handles its own drag-to-move via
 * pointer events (works for mouse AND touch, unlike native HTML5 DnD).
 * Split out of MasterCalendar.tsx alongside DayColumn.tsx; no state or
 * behavior changed from the original inline version, just relocated.
 */

import { useRef, useState } from "react";
import { businessHourMinute, dateKey } from "@/lib/format";
import { type CalEvent, PX_PER_MINUTE, SNAP_MINUTES, DRAG_THRESHOLD_PX, eventHeight, eventTop, statusClasses, timeToHhmm } from "./helpers";

export function EventChip({
  event,
  col,
  totalCols,
  gridStartMinutes,
  serviceName,
  onOpen,
  onDropped,
}: {
  event: CalEvent;
  col: number;
  totalCols: number;
  gridStartMinutes: number;
  serviceName: (id: string) => string;
  onOpen: (e: CalEvent) => void;
  onDropped: (targetDateStr: string, newHour: number, newMinute: number) => Promise<void>;
}) {
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const [preview, setPreview] = useState<{ dx: number; dy: number } | null>(null);

  const top = eventTop(event, gridStartMinutes);
  const height = eventHeight(event);
  const widthPct = 100 / totalCols;
  const leftPct = col * widthPct;

  const handlePointerDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (ev.button !== 0 && ev.pointerType === "mouse") return;
    ev.stopPropagation();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    dragRef.current = { pointerId: ev.pointerId, startX: ev.clientX, startY: ev.clientY, moved: false };
  };

  const handlePointerMove = (ev: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== ev.pointerId) return;
    const dx = ev.clientX - drag.startX;
    const dy = ev.clientY - drag.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) drag.moved = true;
    if (drag.moved) setPreview({ dx, dy });
  };

  const handlePointerUp = async (ev: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.pointerId !== ev.pointerId) return;
    if (!drag.moved) {
      onOpen(event);
      return;
    }
    const dy = ev.clientY - drag.startY;
    setPreview(null);

    const targetEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-daykey]") as HTMLElement | null;
    const targetDateStr = targetEl?.dataset.daykey ?? dateKey(event.start_at);

    const snappedDelta = Math.round(dy / PX_PER_MINUTE / SNAP_MINUTES) * SNAP_MINUTES;
    const orig = businessHourMinute(event.start_at);
    let newTotal = orig.hour * 60 + orig.minute + snappedDelta;
    newTotal = Math.max(0, Math.min(newTotal, 24 * 60 - SNAP_MINUTES));

    await onDropped(targetDateStr, Math.floor(newTotal / 60), newTotal % 60);
  };

  const label =
    event.kind === "booking"
      ? `${timeToHhmm(businessHourMinute(event.start_at).hour, businessHourMinute(event.start_at).minute)} ${serviceName(event.service_id)}`
      : `${timeToHhmm(businessHourMinute(event.start_at).hour, businessHourMinute(event.start_at).minute)} ${event.reason ?? ""}`;

  const sub = event.kind === "booking" ? event.client_name : null;

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top,
        height,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        transform: preview ? `translate(${preview.dx}px, ${preview.dy}px)` : undefined,
        zIndex: preview ? 20 : 1,
        touchAction: "none",
        cursor: "grab",
      }}
      className={`overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] leading-tight shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing ${
        event.kind === "booking" ? statusClasses(event.status) : "border border-dashed border-ink/30 bg-ink/5 text-ink/70"
      }`}
    >
      <div className="truncate font-medium">{label}</div>
      {sub && <div className="truncate opacity-80">{sub}</div>}
    </div>
  );
}
