"use client";

/**
 * One day's grid column, reused by both Day view (one column) and Week view
 * (seven of these side by side). Split out of MasterCalendar.tsx alongside
 * EventChip.tsx.
 */

import { useMemo } from "react";
import { type CalEvent, PX_PER_MINUTE, SNAP_MINUTES, assignColumns, eventsOnDay } from "./helpers";
import { EventChip } from "./EventChip";

export function DayColumn({
  dateStr,
  events,
  gridStartHour,
  gridEndHour,
  serviceName,
  onEmptyClick,
  onOpenEvent,
  onDropEvent,
}: {
  dateStr: string;
  events: CalEvent[];
  gridStartHour: number;
  gridEndHour: number;
  serviceName: (id: string) => string;
  onEmptyClick: (dateStr: string, hour: number, minute: number) => void;
  onOpenEvent: (e: CalEvent) => void;
  onDropEvent: (event: CalEvent, targetDateStr: string, hour: number, minute: number) => Promise<void>;
}) {
  const gridStartMinutes = gridStartHour * 60;
  const totalHeight = (gridEndHour - gridStartHour) * 60 * PX_PER_MINUTE;
  const dayEvents = useMemo(() => assignColumns(eventsOnDay(events, dateStr)), [events, dateStr]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const totalMinutes = gridStartMinutes + y / PX_PER_MINUTE;
    const snapped = Math.max(0, Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES);
    onEmptyClick(dateStr, Math.floor(snapped / 60), snapped % 60);
  };

  return (
    <div
      data-daykey={dateStr}
      onClick={handleClick}
      className="relative flex-1 cursor-pointer border-l border-line/60 hover:bg-ink/[0.02]"
      style={{ height: totalHeight }}
    >
      {Array.from({ length: gridEndHour - gridStartHour }).map((_, i) => (
        <div key={i} className="absolute left-0 right-0 border-t border-line/40" style={{ top: i * 60 * PX_PER_MINUTE }} />
      ))}
      {dayEvents.map((e) => (
        <EventChip
          key={e.id}
          event={e}
          col={e.col}
          totalCols={e.totalCols}
          gridStartMinutes={gridStartMinutes}
          serviceName={serviceName}
          onOpen={onOpenEvent}
          onDropped={(targetDateStr, hour, minute) => onDropEvent(e, targetDateStr, hour, minute)}
        />
      ))}
    </div>
  );
}
