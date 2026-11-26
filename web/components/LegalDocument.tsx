"use client";

/** Страница юридического документа: черновики из docs/legal (lib/legalContent.ts)
 *  в упрощённой разметке — заголовки, абзацы, списки, таблицы, цитаты. */

import Link from "next/link";
import type { ReactNode } from "react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { LEGAL } from "@/lib/legalContent";
import { useLocale } from "@/lib/LocaleContext";
import { backButtonClass, Card } from "@/components/ui";

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(m[1] !== undefined ? <strong key={i++}>{m[1]}</strong> : <em key={i++}>{m[2]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

function render(md: string): ReactNode[] {
  const lines = md.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || /^-{3,}$/.test(line.trim())) { i++; continue; }
    if (line.startsWith(">")) {
      const q: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) q.push(lines[i++].replace(/^>\s?/, ""));
      out.push(
        <blockquote key={k++} className="my-4 rounded-lg border border-line bg-surface p-3 text-sm text-ink-2">
          {inline(q.join(" "))}
        </blockquote>,
      );
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!/^\|[\s|:-]+\|?$/.test(lines[i])) rows.push(cells(lines[i]));
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <div key={k++} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>{head.map((c, j) => <th key={j} className="border border-line p-2 font-semibold">{inline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, a) => (
                <tr key={a}>{r.map((c, j) => <td key={j} className="border border-line p-2 align-top">{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length;
      const text = line.replace(/^#+\s*/, "").replace(/\*\*/g, "");
      out.push(
        level === 1
          ? <h1 key={k++} className="mb-2 mt-6 text-2xl font-semibold text-ink">{text}</h1>
          : <h2 key={k++} className="mb-1 mt-6 text-lg font-semibold text-ink">{text}</h2>,
      );
      i++;
    } else if (/^(\d+\.|[-*])\s/.test(line)) {
      const ordered = /^\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^(\d+\.|[-*])\s/.test(lines[i])) items.push(lines[i++].replace(/^(\d+\.|[-*])\s+/, ""));
      const Tag = ordered ? "ol" : "ul";
      out.push(
        <Tag key={k++} className={`my-2 space-y-1 pl-6 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((it, j) => <li key={j}>{inline(it)}</li>)}
        </Tag>,
      );
    } else {
      const p: string[] = [];
      while (i < lines.length && lines[i].trim() !== "" && !/^(>|\||#|\d+\.\s|[-*]\s|-{3,}$)/.test(lines[i])) p.push(lines[i++]);
      if (p.length === 0) { p.push(lines[i++]); }
      const text = p.join(" ");
      const title = /^\*\*[^*]+\*\*$/.test(text.trim());
      out.push(
        title
          ? <h1 key={k++} className="mb-2 mt-6 text-2xl font-semibold text-ink">{text.replace(/\*\*/g, "")}</h1>
          : <p key={k++} className="my-2">{inline(text)}</p>,
      );
    }
  }
  return out;
}

export default function LegalDocument({ doc }: { doc: "terms" | "privacy" }) {
  const { t, locale } = useLocale();
  return (
    <Card surface>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/" className={backButtonClass}>{t.legalBack}</Link>
        <LanguageSwitcher />
      </div>
      <article className="text-base leading-relaxed text-ink">{render(LEGAL[doc][locale])}</article>
    </Card>
  );
}
