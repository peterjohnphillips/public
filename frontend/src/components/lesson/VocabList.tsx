import type { VocabItem } from "../../types/content";
import { MasteryDot } from "../progress/MasteryDot";
import { useVocabList } from "../../api/vocab";

interface VocabListProps {
  items: VocabItem[];
}

/** Browsing a vocab list doubles as reviewing what's solid: each item shows a
 * four-state mastery dot alongside its text. */
export function VocabList({ items }: VocabListProps) {
  const { data: progressList } = useVocabList({});
  const bucketById = new Map((progressList ?? []).map((item) => [item.id, item.progress?.bucket ?? "new"]));

  if (items.length === 0) {
    return <p className="empty-state">No vocabulary in this lesson yet.</p>;
  }

  return (
    <div className="vocab-grid">
      {items.map((item) => (
        <div key={item.id} className="vocab-item">
          <MasteryDot bucket={bucketById.get(item.id) ?? "new"} />
          <div className="vocab-item__text">
            <div className="vocab-item__devanagari devanagari">{item.devanagari}</div>
            <div className="vocab-item__romanized">{item.romanized}</div>
            <div className="vocab-item__english">{item.english}</div>
            {item.notes && <div className="vocab-item__romanized">{item.notes}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
