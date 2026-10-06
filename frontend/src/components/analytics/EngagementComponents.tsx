import { useId } from 'react';
import {
  ENGAGEMENT_COMPONENTS,
  ENGAGEMENT_SCORE_HELP,
  type EngagementComponentKey,
} from '@/lib/analytics/display';

interface EngagementComponentsProps {
  /** The three component scores (0 to 100). */
  scores: Record<EngagementComponentKey, number>;
  /** The heading above the tiles. */
  title: string;
  /** Heading level, so the section fits the page outline. */
  headingLevel?: 'h2' | 'h3';
}

/**
 * The attendance, community and communication components of an engagement score, each with its
 * weight and a line saying what it measures (PHASE3_SPECS.md 1.5).
 */
export default function EngagementComponents({
  scores,
  title,
  headingLevel: Heading = 'h2',
}: EngagementComponentsProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <Heading id={headingId} className="text-lg font-medium text-gray-900">
        {title}
      </Heading>
      <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ENGAGEMENT_COMPONENTS.map((component) => (
          <div key={component.key} className="bg-white p-4 rounded-lg border border-gray-200">
            <dt className="text-sm font-medium text-gray-600">
              {component.label}{' '}
              <span className="text-xs font-normal text-gray-500">
                ({component.weight}% of the score)
              </span>
            </dt>
            <dd className="mt-1">
              <span className="text-2xl font-bold text-gray-900">
                {Math.round(scores[component.key])}
              </span>
              <span className="text-sm text-gray-500">/100</span>
              <p className="mt-1 text-xs text-gray-500">{component.help}</p>
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-gray-500">{ENGAGEMENT_SCORE_HELP}</p>
    </section>
  );
}
