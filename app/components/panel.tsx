import type { ReactNode } from "react";
import { Maximize2 } from "lucide-react";

type Props = { title: string; children: ReactNode; actions?: ReactNode; onExpand?: () => void; className?: string };

export function Panel({ title, children, actions, onExpand, className = "" }: Props) {
  return <section className={`panel ${className}`}>
    <header className="head"><h2>{title}</h2>{onExpand && <button type="button" className="iconButton" onClick={onExpand} title={`Expand ${title}`} aria-label={`Expand ${title}`}><Maximize2 size={16} /></button>}{actions}</header>
    {children}
  </section>;
}
