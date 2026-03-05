import { List } from "lucide-react";

interface TocItem {
  id: string;
  label: string;
}

const LegalTableOfContents = ({ items }: { items: TocItem[] }) => {
  return (
    <nav className="glass rounded-xl p-4 space-y-1.5">
      <div className="flex items-center gap-2 mb-2">
        <List className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Table of Contents</span>
      </div>
      <ol className="space-y-1">
        {items.map((item, i) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="text-xs text-primary/80 hover:text-primary hover:underline transition-colors flex items-baseline gap-1.5"
            >
              <span className="text-muted-foreground/60 shrink-0 w-4 text-right">{i + 1}.</span>
              <span>{item.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default LegalTableOfContents;
