// The "who do we call first, second, third" view. Grouped by deal channel in Elliot's preference
// order: owners (pocket deals) first, then receivers, brokers, institutions, operators.
import type { Property } from '../lib/types';
import { CHANNEL_ORDER, templateNameFor } from '@data/lib/tabs';
import { Phone, Email, Ready } from './Badges';
import { fmtMoney } from '../lib/staleness';

const CHANNEL_BLURB: Record<string, string> = {
  owner: 'pocket deals: we talk straight to the person who owns the building',
  receiver: 'receivers and lenders sitting on dark buildings earning zero',
  broker: 'listed properties; the broker gets paid when something happens',
  institution: 'AAU, CCA, YMCA and friends. Person-to-person only, never via the residency, never automated',
  operator: 'operating co-living / hostels / SROs; ask for a block rate',
  unknown: 'no channel worked out yet',
};

export function CallList({ rows, onSelect }: { rows: Property[]; onSelect: (p: Property) => void }) {
  const callable = rows.filter((p) => !p.baseline && p.contact_phone && p.contact_phone !== '-' && ['SF-priority', 'SF-other'].includes(p.region) && (p.score ?? 0) >= 40)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  let n = 0;
  return (
    <div className="overflow-auto h-full">
      <div className="px-3 py-2 rounded-none border-b border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 text-[12px]">
        <b>Caller script basics.</b> Ask for: a block of beds from Sept 15, monthly rate per bed, kitchen access, minimum term.
        Landlord worried about tenant rights? This is a 3-month program with visa-bound residents; everyone vacates at program end.
        We sign fast, we pay as a credit tenant, and a block deal beats their vacancy math.
      </div>
      <table className="min-w-full border-collapse table-fixed">
        <colgroup>{[2.5, 16, 11, 14, 4, 5, 6, 6, 7, 10].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
        <tbody>
          {CHANNEL_ORDER.map((ch) => {
            const group = callable.filter((p) => p.deal_channel === ch);
            if (!group.length) return null;
            return [
              <tr key={ch}><td colSpan={10} className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wide text-neutral-500 bg-neutral-50 dark:bg-neutral-900/60">{ch} <span className="normal-case text-neutral-400">- {CHANNEL_BLURB[ch]} ({group.length})</span></td></tr>,
              ...group.map((p) => { n++; return (
                <tr key={p.id} className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900" onClick={() => onSelect(p)}>
                  <td className="td text-neutral-400 text-right">{n}</td>
                  <td className="td whitespace-normal"><span className="font-medium">{p.name}</span>{p.contact_verify && <span className="ml-1" title="number flagged: verify before relying on it">⚠</span>}<div className="text-[11px] text-neutral-500">{(p.contact_name || 'no contact name').slice(0, 60)}</div></td>
                  <td className="td whitespace-normal break-words" onClick={(e) => e.stopPropagation()}><Phone v={p.contact_phone.split(/[·]/)[0].trim()} /></td>
                  <td className="td whitespace-normal break-words text-[11px]" onClick={(e) => e.stopPropagation()}><Email v={(p.contact_email || p.contact_path).slice(0, 60)} /></td>
                  <td className="td text-right font-mono">{p.score}</td>
                  <td className="td text-right">{p.beds_est ?? '?'} beds</td>
                  <td className="td text-right">{fmtMoney(p.price_per_bed_est)}/bed</td>
                  <td className="td">{p.kitchen}</td>
                  <td className="td"><Ready v={p.walk_in_ready} /></td>
                  <td className="td text-[11px] text-neutral-500">use: {templateNameFor(p)}</td>
                </tr>); }),
            ];
          })}
        </tbody>
      </table>
      <div className="px-3 py-3 text-[11px] text-neutral-500">Only SF rows with a phone number and score 40+. Click a row for the full drawer and the prefilled email. The same list lives in the Sheet as the "Call order" tab.</div>
    </div>
  );
}
