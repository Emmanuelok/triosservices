import { SiteApp } from '@/components/site-app';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
export const dynamic='force-dynamic';
export const metadata={title:'My property'+' · Trios'};
export default async function Page(){await requireChatGPTUser('/portal');return <SiteApp page="portal"/>;}
