import { HomeHero } from '@/components/home-hero';
import { HomeSections } from '@/components/home-sections';
import { PublicFooter } from '@/components/public-footer';
import { PublicHeader } from '@/components/public-header';

export default function HomePage() {
  return <div className="min-h-screen bg-background text-foreground"><PublicHeader /><main><HomeHero /><HomeSections /></main><PublicFooter /></div>;
}
