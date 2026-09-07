import { z } from 'zod';
export const validDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const d = new Date(value + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}, 'Enter a real calendar date.');
export const currency = z.number().finite().min(0).max(100000).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001, 'Use no more than two decimal places.');
export const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/St_Johns', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
