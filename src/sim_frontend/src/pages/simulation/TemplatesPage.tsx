import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Edit2, Trash2, Copy, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { templateApi } from '@/lib/api';
import { paramTemplates } from '@/mock/data';

export function TemplatesPage() {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState(paramTemplates);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await templateApi.list() as any[];
      if (data.length > 0) {
        setTemplates(data.map((t: any) => ({
          id: t.template_id,
          name: t.template_name,
          desc: t.template_description || '',
          creator: t.created_by,
          updatedAt: t.updated_at?.slice(0, 10) ?? '',
          usageCount: 0,
        })));
      }
    } catch { /* keep mock data as fallback */ }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const handleDelete = async (id: string) => {
    await templateApi.delete(id).catch(() => {});
    loadTemplates();
  };

  const handleCopy = async (id: string) => {
    await templateApi.copy(id).catch(() => {});
    loadTemplates();
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-100">{t('Parameter Template Management')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('Save common parameter configurations as templates for reuse across plans, avoiding repetitive setup')}</p>
        </div>
        <Button variant="primary" size="sm">
          <Plus size={13} /> {t('New Template')}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {templates.map(tpl => (
          <div key={tpl.id} className="bg-[#0b1d30] border border-[#142235] rounded-xl p-5 hover:border-[#1e3a55] transition-colors group">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">
                {tpl.name[0]}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="xs" variant="ghost"><Edit2 size={11} /></Button>
                <Button size="xs" variant="ghost" onClick={() => handleCopy(tpl.id)}><Copy size={11} /></Button>
                <Button size="xs" variant="ghost" onClick={() => handleDelete(tpl.id)}><Trash2 size={11} className="text-red-400" /></Button>
              </div>
            </div>
            <div className="text-sm font-semibold text-slate-300 mb-1">{tpl.name}</div>
            <div className="text-xs text-slate-500 mb-3">{tpl.desc}</div>
            <div className="flex items-center justify-between text-[11px] text-slate-600">
              <div className="flex items-center gap-1">
                <Clock size={10} /> {t('Updated: {{date}}', { date: tpl.updatedAt })}
              </div>
              <div>{t('Used {{count}} times', { count: tpl.usageCount })}</div>
            </div>
            <div className="mt-3">
              <Button size="xs" variant="outline" className="w-full">
                {t('Apply This Template')}
              </Button>
            </div>
          </div>
        ))}

        {/* New Template Card */}
        <div className="bg-[#0b1d30] border-2 border-dashed border-[#142235] rounded-xl p-5 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-blue-500/30 hover:bg-[#0d2035]/50 transition-all text-slate-600 hover:text-slate-400 min-h-[180px]">
          <Plus size={20} />
          <span className="text-xs">{t('New Parameter Template')}</span>
        </div>
      </div>
    </div>
  );
}
