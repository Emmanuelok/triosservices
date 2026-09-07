// Compatibility exports for protected page imports; no Sites header trust remains.
import { identity } from '@/lib/server';
import { redirect } from 'next/navigation';
import { signInPath,signOutPath } from '@/lib/auth-paths';
export async function getChatGPTUser(){const user=await identity();return user?{...user,displayName:user.name,fullName:user.name}:null}
export async function requireChatGPTUser(returnTo:string){const user=await getChatGPTUser();if(!user)redirect(signInPath(returnTo));return user}
export const chatGPTSignInPath=signInPath;
export const chatGPTSignOutPath=signOutPath;
