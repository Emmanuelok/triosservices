import { SiteApp } from '@/components/site-app';
import { SERVICES } from '@/lib/catalog';
import { notFound } from 'next/navigation';
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const s=SERVICES.find(s=>s.id===slug);return{title:(s?.name||'Service')+' · Trios',description:s?.description}}
export default async function Service({params}:{params:Promise<{slug:string}>}){const {slug}=await params;if(!SERVICES.some(s=>s.id===slug))notFound();return <SiteApp page="service" serviceId={slug}/>}
