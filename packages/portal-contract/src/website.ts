import { z } from 'zod';

export const SOCIAL_PLATFORMS = [
  { id: 'telegram', label: 'Telegram', hosts: ['t.me', 'telegram.me', 'www.telegram.me'] },
  { id: 'whatsapp', label: 'WhatsApp', hosts: ['chat.whatsapp.com', 'wa.me', 'whatsapp.com', 'www.whatsapp.com'] },
  { id: 'instagram', label: 'Instagram', hosts: ['instagram.com', 'www.instagram.com'] },
  { id: 'facebook', label: 'Facebook', hosts: ['facebook.com', 'www.facebook.com'] },
  { id: 'x', label: 'X', hosts: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'] },
] as const;
export type SocialPlatform = typeof SOCIAL_PLATFORMS[number]['id'];

function socialUrl(platform: SocialPlatform) {
  const hosts: readonly string[] = SOCIAL_PLATFORMS.find(item => item.id === platform)!.hosts;
  return z.string().trim().max(500).refine(value => {
    if (value === '') return true;
    if (/[\u0000-\u0020\u007f\\]/.test(value)) return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !url.port && hosts.includes(url.hostname);
    } catch { return false; }
  }, 'Enter an HTTPS link for this platform, or leave it blank to hide the icon.');
}

export const socialLinksSchema = z.object({
  x: socialUrl('x'), facebook: socialUrl('facebook'), instagram: socialUrl('instagram'),
  whatsapp: socialUrl('whatsapp'), telegram: socialUrl('telegram'),
}).strict();
export type SocialLinks = z.infer<typeof socialLinksSchema>;

export const DEFAULT_SOCIAL_LINKS: Readonly<SocialLinks> = {
  x: 'https://x.com/kineticrouter',
  facebook: 'https://www.facebook.com/kineticrouter/',
  instagram: 'https://www.instagram.com/kineticrouter/',
  whatsapp: 'https://chat.whatsapp.com/JC3mWPNdZbT3AO7UYxMozT',
  telegram: 'https://t.me/+uqo4MKTpCA4yODI1',
};

export const publicWebsiteSettingsSchema = z.object({ socialLinks: socialLinksSchema }).strict();
export const websiteSettingsSchema = publicWebsiteSettingsSchema.extend({ revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1) }).strict();
export type WebsiteSettings = z.infer<typeof websiteSettingsSchema>;
