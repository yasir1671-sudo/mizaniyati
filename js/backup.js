// النسخ الاحتياطي: حفظ ملف واسترجاعه
import { h, toast, confirmSheet } from './ui.js';
import { store, backupPayload, isBackup } from './store.js';
import { todayISO, dayLabel, txCountText } from './dates.js';

function markBackup() {
  store.update((s) => { s.settings.lastBackupAt = Date.now(); });
}

export async function exportBackup() {
  const json = JSON.stringify(backupPayload(), null, 1);
  const name = `mizaniyati-${todayISO()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'نسخة ميزانيتي' });
      markBackup();
      toast('انحفظت النسخة');
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  markBackup();
  toast('نزلت النسخة بمجلد التنزيلات');
}

export function pickBackupFile() {
  const input = h('input', { type: 'file', accept: '.json,application/json,text/plain', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    input.remove();
    if (f) await importBackup(f);
  });
  document.body.append(input);
  input.click();
}

async function importBackup(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    toast('هالملف مو نسخة من ميزانيتي.');
    return;
  }
  if (!isBackup(payload)) {
    toast('هالملف مو نسخة من ميزانيتي.');
    return;
  }
  const n = payload.data.transactions.length;
  const when = payload.exportedAt ? `، محفوظة ${dayLabel(payload.exportedAt.slice(0, 10))}` : '';
  const ok = await confirmSheet('استرجاع النسخة؟', `النسخة فيها ${txCountText(n)}${when}. رح تحل محل كل البيانات اللي هلّق على الجهاز.`, 'استرجع');
  if (!ok) return;
  store.replaceAll(payload.data);
  toast('رجعت البيانات من النسخة');
}
