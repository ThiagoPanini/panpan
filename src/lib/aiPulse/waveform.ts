/**
 * AI Pulse Log — Waveform
 * Generates SVG path data for seismic/biometric waveforms at build time.
 * Uses Catmull-Rom to Cubic Bezier interpolation for smooth curves.
 */

export interface WavePoint {
  x: number;
  y: number;
}

export interface WavePaths {
  fill: string;  // Closed filled area between wave and centerline
  stroke: string; // Open wave stroke path
}

/**
 * Converts a series of daily interaction values to smooth SVG wave paths.
 *
 * @param values        Array of interaction counts (one per day)
 * @param svgWidth      Total SVG width in user units
 * @param centerY       Baseline Y-coordinate for this channel
 * @param maxAmplitude  Max pixel deviation from baseline
 * @param direction     'up' = waves go toward y=0, 'down' = toward y=max
 * @param globalMax     Normalization reference (shared across all channels)
 */
export function generateWavePath(
  values: number[],
  svgWidth: number,
  centerY: number,
  maxAmplitude: number,
  direction: 'up' | 'down',
  globalMax: number = 1,
): WavePaths {
  const n = values.length;
  if (n === 0) return { fill: '', stroke: '' };

  const stepX = n > 1 ? svgWidth / (n - 1) : 0;

  // Map values to amplitude points
  const ampPoints: WavePoint[] = values.map((v, i) => {
    const normalized = Math.min(v / Math.max(globalMax, 1), 1);
    // Add slight visual noise so zero-value days still have a micro-ripple
    const amp = normalized * maxAmplitude + (normalized > 0 ? 0 : 1.2);
    const y = direction === 'up' ? centerY - amp : centerY + amp;
    return { x: i * stepX, y };
  });

  const strokePath = catmullRomPath(ampPoints);
  const lastX = (n - 1) * stepX;
  const fillPath = `${strokePath} L ${lastX.toFixed(1)} ${centerY} L 0 ${centerY} Z`;

  return { fill: fillPath, stroke: strokePath };
}

/**
 * Generates a smooth path through points using Catmull-Rom → Cubic Bezier.
 */
function catmullRomPath(pts: WavePoint[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;

  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    // Catmull-Rom tension = 0.5
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)},${cp2x.toFixed(2)} ${cp2y.toFixed(2)},${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  return d;
}

/**
 * Computes evenly-spaced day-column X positions for hover interaction zones.
 */
export function getColumnXPositions(count: number, svgWidth: number): number[] {
  if (count === 0) return [];
  const stepX = svgWidth / (count - 1);
  return Array.from({ length: count }, (_, i) => i * stepX);
}

/**
 * Returns a set of date string labels to display on the temporal axis,
 * picking a label every N days plus always including the last date.
 */
export function getTemporalLabels(
  dates: string[],
  interval: number = 7,
): Array<{ date: string; x: number; svgX: number }> {
  const n = dates.length;
  const svgWidth = 1200;
  const stepX = n > 1 ? svgWidth / (n - 1) : 0;

  const labels: Array<{ date: string; x: number; svgX: number }> = [];
  for (let i = 0; i < n; i++) {
    if (i % interval === 0 || i === n - 1) {
      labels.push({
        date: formatDateLabel(dates[i]),
        x: i,
        svgX: i * stepX,
      });
    }
  }
  return labels;
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
