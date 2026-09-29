import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { toBlob } from 'html-to-image';
import JSZip from 'jszip';

import { ExportTable, ExportTableProps } from '@/components/ExportTable';
import { planHasAlternatingWeeks } from '@/types/carpool';
import { isTauri } from '@/lib/config';

const CAPTURE_SELECTOR = '[data-export-capture="true"]';
const PIXEL_RATIO = 2;

/**
 * Renders one week offscreen and rasterises it. Offscreen rather than hidden
 * because html-to-image needs real layout, and inside the live document so the
 * capture inherits the app's stylesheet and current theme.
 */
async function captureWeek(props: ExportTableProps): Promise<Blob> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;';
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    root.render(createElement(ExportTable, props));
    // Let React commit and the browser lay the table out before measuring it.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await document.fonts.ready;

    const target = host.querySelector<HTMLElement>(CAPTURE_SELECTOR);
    if (!target) throw new Error('Export capture target not found');

    const blob = await toBlob(target, { pixelRatio: PIXEL_RATIO });
    if (!blob) throw new Error('Rasterising the export view produced no image');
    return blob;
  } finally {
    root.unmount();
    host.remove();
  }
}

export interface PlanPngExport {
  blob: Blob;
  extension: 'png' | 'zip';
}

/**
 * A plan with alternating weeks exports both weeks bundled into one ZIP
 * (mirroring what the old backend endpoint returned); a single-week plan is
 * just one PNG, exported as-is.
 */
export async function buildPlanPngExport(props: Omit<ExportTableProps, 'isWeekA'>): Promise<PlanPngExport> {
  if (!planHasAlternatingWeeks(props.plan)) {
    return { blob: await captureWeek({ ...props, isWeekA: true }), extension: 'png' };
  }
  const zip = new JSZip();
  zip.file('driving-plan-week-a.png', await captureWeek({ ...props, isWeekA: true }));
  zip.file('driving-plan-week-b.png', await captureWeek({ ...props, isWeekA: false }));
  return { blob: await zip.generateAsync({ type: 'blob' }), extension: 'zip' };
}

const SAVE_FILTERS: Record<PlanPngExport['extension'], { name: string; extensions: string[] }> = {
  png: { name: 'PNG image', extensions: ['png'] },
  zip: { name: 'ZIP archive', extensions: ['zip'] },
};

/** Returns false when the user dismissed the native save dialog. */
export async function saveExport({ blob, extension }: PlanPngExport, basename: string): Promise<boolean> {
  const filename = `${basename}.${extension}`;
  if (isTauri()) {
    const [{ save }, { writeFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ]);
    const path = await save({
      defaultPath: filename,
      filters: [SAVE_FILTERS[extension]],
    });
    if (!path) return false;
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return true;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}
